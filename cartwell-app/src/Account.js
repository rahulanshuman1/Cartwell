import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { getMyOrders, updateName, changePassword } from "./api";
import { metaFor } from "./meta";
import AuthScreen from "./AuthScreen";
import PasswordInput from "./PasswordInput";
import AddressBook from "./AddressBook";
import { useTheme, inr } from "./theme";

function refundText(o) {
  const s = o.refund_status;
  if (s === "refunded") return `An item sold out. We refunded ${inr(o.amount_paise)} to your original payment method. It can take 5 to 7 working days to show in your account.`;
  if (s === "initiated") return `An item sold out. Your refund of ${inr(o.amount_paise)} has started. It can take 5 to 7 working days.`;
  if (s === "manual") return `An item sold out. We are sorting out your refund by hand and will be in touch. Your order reference is ${o.id.slice(0, 8)}.`;
  return `An item sold out. We are refunding ${inr(o.amount_paise)} automatically.`;
}
const fmt = (d, o) => new Date(d).toLocaleDateString("en-IN", o);

export default function Account() {
  const t = useTheme();
  const { user, setUser, ready, signOut, adopt } = useAuth();
  const { dispatch } = useCart();
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setOrders(await getMyOrders()); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { if (user) load(); else setOrders(null); }, [user, load]);

  if (!ready) return <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />;
  if (!user) return <AuthScreen />;

  const say = (m) => { setFlash(m); setTimeout(() => setFlash(""), 2000); };
  const card = { backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 14, overflow: "hidden" };
  const input = { flex: 1, backgroundColor: t.bg, color: t.ink, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 10 };
  const label = { color: t.muted, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" };
  const small = (bg, _fg, border) => ({ backgroundColor: bg, borderWidth: border ? 1 : 0, borderColor: t.line, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, opacity: busy ? 0.6 : 1 });
  const initials = (user.name || "").trim()
    ? user.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("")
    : String(user.email || user.phone || "?").charAt(0).toUpperCase();

  async function saveName() {
    if (name.trim().length < 2) return setMsg("Enter your full name.");
    setBusy(true); setMsg("");
    try { setUser(await updateName(name.trim())); setEditing(false); say("Name updated"); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function savePassword() {
    if (!cur) return setMsg("Enter your current password.");
    if (next.length < 8) return setMsg("Use a new password of at least 8 characters.");
    setBusy(true); setMsg("");
    try { await adopt(await changePassword({ currentPassword: cur, newPassword: next })); setCur(""); setNext(""); say("Password updated"); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      {/* Profile header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.brand, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.onBrand, fontSize: 20, fontWeight: "800" }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>{user.name || "Cartwell customer"}</Text>
          <Text style={{ color: t.muted }}>{[user.email, user.phone && "+91 " + user.phone].filter(Boolean).join("  |  ")}</Text>
          {!!user.created_at && <Text style={{ color: t.muted, fontSize: 13 }}>Member since {fmt(user.created_at, { month: "long", year: "numeric" })}</Text>}
        </View>
      </View>
      {!!flash && <Text accessibilityLiveRegion="polite" style={{ color: t.ok, fontWeight: "700" }}>{flash}</Text>}

      {/* Orders */}
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>Your orders</Text>
      {!!err && <Pressable onPress={load} accessibilityRole="button"><Text style={{ color: t.danger }}>{err} Tap to retry.</Text></Pressable>}
      {orders === null && !err && <ActivityIndicator color={t.brand} />}
      {orders && !orders.length && <Text style={{ color: t.muted }}>No orders yet. When you buy something while signed in, it shows up here.</Text>}
      {orders && orders.map((o) => {
        const ok = o.status === "paid";
        return (
          <View key={o.id} style={card}>
            <View style={{ backgroundColor: t.bg, padding: 12, flexDirection: "row", flexWrap: "wrap", gap: 12, borderBottomWidth: 1, borderColor: t.line }}>
              {[["Order placed", fmt(o.created_at, { day: "numeric", month: "short", year: "numeric" })], ["Total", inr(o.amount_paise)], ["Ship to", o.ship_to?.name || "-"], ["Order #", o.id.slice(0, 8).toUpperCase()]].map(([k, v]) => (
                <View key={k} style={{ minWidth: "40%" }}><Text style={label}>{k}</Text><Text style={{ color: t.ink, fontWeight: "600" }}>{v}</Text></View>
              ))}
            </View>
            <View style={{ padding: 12, gap: 10 }}>
              <Text style={{ color: ok ? t.ok : t.danger, fontWeight: "700" }}>{ok ? "Order placed, payment received" : "Cancelled"}</Text>
              {!ok && <Text style={{ color: t.muted, fontSize: 13 }}>{refundText(o)}</Text>}
              {o.items.map((it, n) => {
                const m = metaFor(it.product_id);
                return (
                  <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: m.t, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 28 }}>{m.e}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.ink, fontWeight: "600" }}>{it.name}</Text>
                      <Text style={{ color: t.muted, fontSize: 13 }}>Qty {it.qty}{it.price_paise ? `  ·  ${inr(it.price_paise)} each` : ""}</Text>
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => { dispatch({ type: "add", id: it.product_id }); say("Added to cart"); }} style={small(t.card, t.ink, true)}>
                      <Text style={{ color: t.ink, fontWeight: "700", fontSize: 13 }}>Buy again</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <AddressBook />

      {/* Account details */}
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800", marginTop: 8 }}>Account details</Text>
      <View style={[card, { padding: 14, gap: 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {editing ? (
            <>
              <TextInput value={name} onChangeText={setName} maxLength={60} autoComplete="name" accessibilityLabel="Name" style={input} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={saveName} style={small(t.brand)}><Text style={{ color: t.onBrand, fontWeight: "700" }}>Save</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setEditing(false); setMsg(""); }}><Text style={{ color: t.brand, fontWeight: "700" }}>Cancel</Text></Pressable>
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}><Text style={label}>Name</Text><Text style={{ color: t.ink, fontWeight: "600" }}>{user.name || "Not added yet"}</Text></View>
              <Pressable accessibilityRole="button" onPress={() => { setName(user.name || ""); setEditing(true); setMsg(""); }} style={small(t.card, t.ink, true)}><Text style={{ color: t.ink, fontWeight: "700", fontSize: 13 }}>Edit</Text></Pressable>
            </>
          )}
        </View>
        <View><Text style={label}>Email</Text><Text style={{ color: t.ink, fontWeight: "600" }}>{user.email || "Not added"}</Text></View>
        <View><Text style={label}>Mobile number</Text><Text style={{ color: t.ink, fontWeight: "600" }}>{user.phone ? "+91 " + user.phone : "Not added"}</Text></View>
        <Text style={{ color: t.muted, fontSize: 13 }}>Email and mobile number can’t be changed here yet.</Text>
      </View>

      {/* Login & security */}
      <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800", marginTop: 8 }}>Login & security</Text>
      <View style={[card, { padding: 14, gap: 10 }]}>
        {user.has_password ? (
          <>
            <Text style={{ color: t.ink, fontWeight: "700" }}>Change password</Text>
            <PasswordInput value={cur} onChangeText={setCur} placeholder="Current password" placeholderTextColor={t.muted} maxLength={128} autoComplete="current-password" style={input} />
            <PasswordInput value={next} onChangeText={setNext} placeholder="New password (8+ characters)" placeholderTextColor={t.muted} maxLength={128} autoComplete="new-password" style={input} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={savePassword} style={{ backgroundColor: t.brand, padding: 12, borderRadius: 12, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
              <Text style={{ color: t.onBrand, fontWeight: "700" }}>Update password</Text>
            </Pressable>
            <Text style={{ color: t.muted, fontSize: 13 }}>Changing your password signs you out on your other devices.</Text>
          </>
        ) : (
          <Text style={{ color: t.muted }}>
            {user.email
              ? "This account has no password. You sign in with a phone code or Google. To set one, sign out and use “Forgot password” with your email."
              : "This account signs in with a phone code. A password can’t be added to accounts without an email yet."}
          </Text>
        )}
      </View>
      {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: t.danger }}>{msg}</Text>}

      <Pressable accessibilityRole="button" onPress={signOut} style={{ borderWidth: 1, borderColor: t.line, padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8 }}>
        <Text style={{ color: t.ink, fontWeight: "700" }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
