import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import RazorpayCheckout from "react-native-razorpay";
import { createOrder, verifyPayment, getAddresses, addAddress } from "./api";
import { useCart } from "./cart";
import { useAuth } from "./auth";
import { useTheme, inr } from "./theme";

const FIELDS = [
  { k: "name", label: "Full name", hint: "name", max: 60, kb: "default", ok: (v) => v.trim().length >= 2, err: "Enter your full name." },
  { k: "email", label: "Email", hint: "email", max: 80, kb: "email-address", ok: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()), err: "Enter a valid email address." },
  { k: "phone", label: "Mobile number", hint: "tel", max: 10, kb: "number-pad", ok: (v) => /^[6-9]\d{9}$/.test(v), err: "Enter a 10-digit Indian mobile number." },
  { k: "pin", label: "PIN code", hint: "postal-code", max: 6, kb: "number-pad", ok: (v) => /^\d{6}$/.test(v), err: "Enter a 6-digit PIN code." },
  { k: "addr", label: "Address", hint: "street-address", max: 120, kb: "default", ok: (v) => v.trim().length >= 8, err: "Enter your full address." },
];

export default function Checkout({ products, onClose }) {
  const t = useTheme();
  const { cart, dispatch } = useCart();
  const { user } = useAuth();
  const [f, setF] = useState({ name: user?.name || "", email: user?.email || "", phone: user?.phone || "", pin: "", addr: "" });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);
  const [saved, setSaved] = useState([]);
  const [pick, setPick] = useState(undefined); // undefined = not chosen yet, "" = new address, otherwise a saved address id
  const [saveIt, setSaveIt] = useState(true);

  const applyAddr = (a) => { setPick(a.id); setF((prev) => ({ ...prev, name: a.name, phone: a.phone, pin: a.pin, addr: a.addr })); };
  useEffect(() => {
    if (!user) return;
    getAddresses().then((list) => {
      setSaved(list);
      const d = list.find((a) => a.is_default) || list[0];
      if (d) applyAddr(d);
    }).catch(() => {}); // saved addresses are a convenience, so checkout works without them
  }, [user]);

  const sub = Object.keys(cart).reduce((a, id) => a + (products[id]?.price_paise || 0) * cart[id], 0);
  const total = sub + (sub >= 49900 ? 0 : 4900);

  async function pay() {
    const e = {};
    FIELDS.forEach((x) => { if (!x.ok(f[x.k])) e[x.k] = x.err; });
    setErrs(e);
    if (Object.keys(e).length) return;
    const same = saved.some((a) => a.name === f.name.trim() && a.phone === f.phone && a.pin === f.pin && a.addr === f.addr.trim());
    if (user && saveIt && (pick === "" || !saved.length) && !same) {
      addAddress({ name: f.name.trim(), phone: f.phone, pin: f.pin, addr: f.addr.trim() }).catch(() => {});
    }
    setBusy(true); setMsg("");
    try {
      const items = Object.keys(cart).map((id) => ({ id: Number(id), qty: cart[id] }));
      const customer = { name: f.name.trim(), email: f.email.trim(), phone: f.phone, pin: f.pin, addr: f.addr.trim() };
      const order = await createOrder(items, customer);
      let result;
      try {
        result = await RazorpayCheckout.open({
          key: order.keyId, order_id: order.razorpayOrderId, amount: order.amount, currency: order.currency,
          name: "Cartwell", description: "Order payment",
          prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        });
      } catch (err) {
        setMsg(err?.code === 0 ? "Payment cancelled. Your cart is saved." : "Payment failed. You have not been charged, or any charge will be refunded.");
        return;
      }
      const v = await verifyPayment({
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
      });
      if (v.status === "paid") { dispatch({ type: "clear" }); setDone(order.orderId); }
      else setMsg(v.status === "failed" ? "Sorry, an item sold out just before your payment finished. We are refunding the full amount automatically. It can take 5 to 7 working days to show up." : "We received your payment but could not confirm the order. Your order reference is " + order.orderId.slice(0, 8) + ".");
    } catch (err) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const btn = { backgroundColor: t.accent, padding: 14, borderRadius: 12, alignItems: "center" };
  if (done) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: "center", gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: t.ink }}>Order placed</Text>
        <Text style={{ color: t.ink, fontSize: 16 }}>Thank you, {f.name.trim().split(" ")[0]}. Your order {done.slice(0, 8)} is confirmed.</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={{ ...btn, backgroundColor: t.brand }}>
          <Text style={{ color: t.onBrand, fontWeight: "700" }}>Keep shopping</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "800", color: t.ink }}>Delivery details</Text>
          <Pressable accessibilityRole="button" onPress={onClose} disabled={busy}><Text style={{ color: t.brand, fontWeight: "700" }}>Close</Text></Pressable>
        </View>
        {!!user && saved.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink, fontWeight: "700" }}>Deliver to</Text>
            {saved.map((a) => (
              <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: pick === a.id }} onPress={() => applyAddr(a)}
                style={{ borderWidth: 1.5, borderColor: pick === a.id ? t.brand : t.line, backgroundColor: t.card, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: t.ink, fontWeight: "700" }}>{a.name}{a.is_default ? "  (Default)" : ""}</Text>
                <Text style={{ color: t.muted }}>{a.addr}, PIN {a.pin}</Text>
                <Text style={{ color: t.muted }}>+91 {a.phone}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: pick === "" }} onPress={() => { setPick(""); setF({ ...f, pin: "", addr: "" }); }}
              style={{ borderWidth: 1.5, borderColor: pick === "" ? t.brand : t.line, backgroundColor: t.card, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: t.ink, fontWeight: "700" }}>Use a new address</Text>
            </Pressable>
          </View>
        )}
        {FIELDS.map((x) => (
          <View key={x.k}>
            <Text style={{ color: t.muted, marginBottom: 4 }}>{x.label}</Text>
            <TextInput
              value={f[x.k]} onChangeText={(v) => setF({ ...f, [x.k]: v })}
              maxLength={x.max} keyboardType={x.kb} autoComplete={x.hint} editable={!busy}
              autoCapitalize={x.k === "email" ? "none" : "words"}
              style={{ backgroundColor: t.card, color: t.ink, borderWidth: 1, borderColor: errs[x.k] ? t.danger : t.line, borderRadius: 10, padding: 12 }}
            />
            {!!errs[x.k] && <Text style={{ color: t.danger, fontSize: 13, marginTop: 2 }}>{errs[x.k]}</Text>}
          </View>
        ))}
        {!!user && (pick === "" || saved.length === 0) && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: t.ink }}>Save this address to my account</Text>
            <Switch value={saveIt} onValueChange={setSaveIt} />
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink }}>Total</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: t.ink }}>{inr(total)}</Text>
        </View>
        {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: t.danger }}>{msg}</Text>}
        <Pressable accessibilityRole="button" onPress={pay} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={{ color: t.onAccent, fontWeight: "700" }}>Pay securely</Text>}
        </Pressable>
        <Text style={{ color: t.muted, fontSize: 13 }}>You pay on Razorpay’s secure screen. This app never sees or stores your card details.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
