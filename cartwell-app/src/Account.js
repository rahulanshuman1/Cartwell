import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useAuth } from "./auth";
import { getMyOrders } from "./api";
import AuthScreen from "./AuthScreen";
import { useTheme, inr } from "./theme";

function refundText(o) {
  const s = o.refund_status;
  if (s === "refunded") return `An item sold out. We refunded ${inr(o.amount_paise)} to your original payment method. It can take 5 to 7 working days to show in your account.`;
  if (s === "initiated") return `An item sold out. Your refund of ${inr(o.amount_paise)} has started. It can take 5 to 7 working days.`;
  if (s === "manual") return `An item sold out. We are sorting out your refund by hand and will be in touch. Your order reference is ${o.id.slice(0, 8)}.`;
  return `An item sold out. We are refunding ${inr(o.amount_paise)} automatically.`;
}

export default function Account() {
  const t = useTheme();
  const { user, ready, signOut } = useAuth();
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setOrders(await getMyOrders()); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { if (user) load(); else setOrders(null); }, [user, load]);

  if (!ready) return <ActivityIndicator color={t.brand} style={{ marginTop: 40 }} />;
  if (!user) return <AuthScreen />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ color: t.ink, fontSize: 24, fontWeight: "800" }}>{user.name ? `Hi, ${user.name.split(" ")[0]}` : "Your account"}</Text>
      <Text style={{ color: t.muted }}>{[user.email, user.phone && "+91 " + user.phone].filter(Boolean).join("  |  ")}</Text>

      <Text style={{ color: t.ink, fontSize: 18, fontWeight: "800", marginTop: 12 }}>Your orders</Text>
      {!!err && <Pressable onPress={load} accessibilityRole="button"><Text style={{ color: t.danger }}>{err} Tap to retry.</Text></Pressable>}
      {orders === null && !err && <ActivityIndicator color={t.brand} />}
      {orders && !orders.length && <Text style={{ color: t.muted }}>No orders yet. When you buy something while signed in, it shows up here.</Text>}
      {orders && orders.map((o) => (
        <View key={o.id} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: t.ink, fontWeight: "700" }}>Order {o.id.slice(0, 8)}</Text>
            <Text style={{ color: o.status === "paid" ? t.ok : t.danger, fontWeight: "700" }}>{o.status === "paid" ? "Paid" : "Cancelled"}</Text>
          </View>
          <Text style={{ color: t.muted }}>{new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</Text>
          {o.items.map((i, n) => <Text key={n} style={{ color: t.ink }}>{i.qty} x {i.name}</Text>)}
          <Text style={{ color: t.ink, fontWeight: "800" }}>{inr(o.amount_paise)}</Text>
          {o.status === "failed" && <Text style={{ color: t.muted, fontSize: 13 }}>{refundText(o)}</Text>}
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={signOut} style={{ borderWidth: 1, borderColor: t.line, padding: 14, borderRadius: 12, alignItems: "center", marginTop: 16 }}>
        <Text style={{ color: t.ink, fontWeight: "700" }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
