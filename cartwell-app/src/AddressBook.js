import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Switch, Alert } from "react-native";
import { getAddresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } from "./api";
import { useAuth } from "./auth";
import { useTheme } from "./theme";

const EMPTY = { name: "", phone: "", pin: "", addr: "", is_default: false };

export default function AddressBook() {
  const t = useTheme();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null); // null, "new", or an address
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setList(await getAddresses()); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const input = { backgroundColor: t.bg, color: t.ink, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 10 };
  const link = { color: t.brand, fontWeight: "700" };

  const startNew = () => { setF({ ...EMPTY, name: user?.name || "", phone: user?.phone || "", is_default: !(list && list.length) }); setMsg(""); setEdit("new"); };
  const startEdit = (a) => { setF({ name: a.name, phone: a.phone, pin: a.pin, addr: a.addr, is_default: a.is_default }); setMsg(""); setEdit(a); };

  async function save() {
    const bad = f.name.trim().length < 2 ? "Enter the full name."
      : !/^[6-9]\d{9}$/.test(f.phone) ? "Enter a 10-digit Indian mobile number."
      : !/^\d{6}$/.test(f.pin) ? "Enter a 6-digit PIN code."
      : f.addr.trim().length < 8 ? "Enter the full address." : "";
    if (bad) return setMsg(bad);
    setBusy(true); setMsg("");
    const body = { name: f.name.trim(), phone: f.phone, pin: f.pin, addr: f.addr.trim(), is_default: f.is_default };
    try {
      if (edit === "new") await addAddress(body); else await updateAddress(edit.id, body);
      setEdit(null); await load();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const remove = (a) => Alert.alert("Remove address", "Remove this address from your account?", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: async () => { try { await deleteAddress(a.id); await load(); } catch (e) { setErr(e.message); } } },
  ]);
  const makeDefault = async (a) => { try { await setDefaultAddress(a.id); await load(); } catch (e) { setErr(e.message); } };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>Your addresses</Text>
        {!edit && list && list.length < 10 && <Pressable accessibilityRole="button" onPress={startNew}><Text style={link}>+ Add address</Text></Pressable>}
      </View>
      {!!err && <Pressable onPress={load} accessibilityRole="button"><Text style={{ color: t.danger }}>{err} Tap to retry.</Text></Pressable>}
      {list === null && !err && <ActivityIndicator color={t.brand} />}

      {edit ? (
        <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ color: t.ink, fontWeight: "700" }}>{edit === "new" ? "Add a new address" : "Edit address"}</Text>
          <TextInput value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="Full name" placeholderTextColor={t.muted} maxLength={60} autoComplete="name" style={input} />
          <TextInput value={f.phone} onChangeText={(v) => setF({ ...f, phone: v.replace(/\D/g, "") })} placeholder="Mobile number (10 digits)" placeholderTextColor={t.muted} maxLength={10} keyboardType="number-pad" autoComplete="tel" style={input} />
          <TextInput value={f.pin} onChangeText={(v) => setF({ ...f, pin: v.replace(/\D/g, "") })} placeholder="PIN code" placeholderTextColor={t.muted} maxLength={6} keyboardType="number-pad" autoComplete="postal-code" style={input} />
          <TextInput value={f.addr} onChangeText={(v) => setF({ ...f, addr: v })} placeholder="Address" placeholderTextColor={t.muted} maxLength={120} autoComplete="street-address" style={input} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: t.ink }}>Make this my default address</Text>
            <Switch value={f.is_default} onValueChange={(v) => setF({ ...f, is_default: v })} />
          </View>
          {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: t.danger }}>{msg}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={save} style={{ backgroundColor: t.brand, padding: 12, borderRadius: 12, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color={t.onBrand} /> : <Text style={{ color: t.onBrand, fontWeight: "700" }}>Save address</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setEdit(null)}><Text style={[link, { textAlign: "center" }]}>Cancel</Text></Pressable>
        </View>
      ) : (
        <>
          {list && !list.length && <Text style={{ color: t.muted }}>No saved addresses yet. Add one to check out faster.</Text>}
          {list && list.map((a) => (
            <View key={a.id} style={{ backgroundColor: t.card, borderWidth: a.is_default ? 1.5 : 1, borderColor: a.is_default ? t.brand : t.line, borderRadius: 14, padding: 14, gap: 2 }}>
              {a.is_default && <Text style={{ color: t.brand, fontWeight: "800", fontSize: 12, marginBottom: 2 }}>DEFAULT</Text>}
              <Text style={{ color: t.ink, fontWeight: "700" }}>{a.name}</Text>
              <Text style={{ color: t.ink }}>{a.addr}</Text>
              <Text style={{ color: t.ink }}>PIN {a.pin}</Text>
              <Text style={{ color: t.muted }}>Mobile: +91 {a.phone}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => startEdit(a)}><Text style={link}>Edit</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => remove(a)}><Text style={link}>Remove</Text></Pressable>
                {!a.is_default && <Pressable accessibilityRole="button" onPress={() => makeDefault(a)}><Text style={link}>Set as default</Text></Pressable>}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
