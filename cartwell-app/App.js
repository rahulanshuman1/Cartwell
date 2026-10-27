import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { CartProvider, useCart } from "./src/cart";
import { getProducts } from "./src/api";
import { metaFor } from "./src/meta";
import { useTheme, inr } from "./src/theme";
import Checkout from "./src/Checkout";
import Account from "./src/Account";
import { AuthProvider } from "./src/auth";

const SORTS = [["rel", "Featured"], ["lo", "Price ↑"], ["hi", "Price ↓"]];

function Shop({ products, loading, error, reload, onOpen }) {
  const t = useTheme();
  const { dispatch } = useCart();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("rel");

  const cats = useMemo(() => ["All", ...new Set(products.map((p) => metaFor(p.id).c))], [products]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    let l = products.filter((p) => (cat === "All" || metaFor(p.id).c === cat) && (!s || p.name.toLowerCase().includes(s)));
    if (sort === "lo") l = [...l].sort((a, b) => a.price_paise - b.price_paise);
    if (sort === "hi") l = [...l].sort((a, b) => b.price_paise - a.price_paise);
    return l;
  }, [products, q, cat, sort]);

  const chip = (on) => ({ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
    borderColor: on ? t.ink : t.line, backgroundColor: on ? t.ink : t.card, marginRight: 8 });

  return (
    <FlatList
      data={list} numColumns={2} keyExtractor={(p) => String(p.id)}
      contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
      columnWrapperStyle={{ gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={t.brand} />}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 12 }}>
          <View style={{ backgroundColor: t.brand, borderRadius: 16, padding: 20, gap: 6 }}>
            <Text style={{ color: t.onBrand, fontSize: 28, fontWeight: "800" }}>Daily essentials, delivered fast</Text>
            <Text style={{ color: t.onBrand, opacity: 0.9 }}>Free delivery above ₹499. Easy 10-day returns.</Text>
          </View>
          <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={t.muted} maxLength={60}
            accessibilityLabel="Search products"
            style={{ backgroundColor: t.card, color: t.ink, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {cats.map((c) => (
              <Pressable key={c} onPress={() => setCat(c)} accessibilityRole="button" accessibilityState={{ selected: c === cat }} style={chip(c === cat)}>
                <Text style={{ color: c === cat ? t.bg : t.ink }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: t.muted }}>{list.length} product{list.length === 1 ? "" : "s"}</Text>
            <View style={{ flexDirection: "row" }}>
              {SORTS.map(([k, l]) => (
                <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" style={{ marginLeft: 12 }}>
                  <Text style={{ color: sort === k ? t.brand : t.muted, fontWeight: sort === k ? "700" : "400" }}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {!!error && (
            <Pressable onPress={reload} accessibilityRole="button" style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.danger }}>
              <Text style={{ color: t.danger }}>{error} Tap to retry.</Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={loading ? <ActivityIndicator color={t.brand} style={{ marginTop: 30 }} /> :
        <Text style={{ color: t.muted, textAlign: "center", marginTop: 30 }}>No products match. Try a different word or category.</Text>}
      renderItem={({ item: p }) => {
        const m = metaFor(p.id), out = p.stock <= 0;
        return (
          <View style={{ flex: 1, backgroundColor: t.card, borderRadius: 12, borderWidth: 1, borderColor: t.line, overflow: "hidden", marginBottom: 12 }}>
            <Pressable onPress={() => onOpen(p)} accessibilityRole="button" accessibilityLabel={"View " + p.name}
              style={{ aspectRatio: 1, backgroundColor: m.t, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 56 }}>{m.e}</Text>
            </Pressable>
            <View style={{ padding: 10, gap: 4 }}>
              <Text numberOfLines={2} style={{ color: t.ink, fontWeight: "600" }}>{p.name}</Text>
              <Text style={{ color: t.ink, fontWeight: "800" }}>{inr(p.price_paise)}</Text>
              <Pressable disabled={out} onPress={() => dispatch({ type: "add", id: p.id })} accessibilityRole="button"
                style={{ backgroundColor: t.accent, borderRadius: 10, padding: 10, alignItems: "center", opacity: out ? 0.5 : 1 }}>
                <Text style={{ color: t.onAccent, fontWeight: "700" }}>{out ? "Out of stock" : "Add to cart"}</Text>
              </Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}

function CartView({ products, onCheckout }) {
  const t = useTheme();
  const { cart, dispatch } = useCart();
  const ids = Object.keys(cart).filter((id) => products[id]);
  const sub = ids.reduce((a, id) => a + products[id].price_paise * cart[id], 0);
  const ship = sub >= 49900 ? 0 : 4900;
  if (!ids.length) return <Text style={{ color: t.muted, textAlign: "center", marginTop: 60 }}>Your cart is empty. Add something you like.</Text>;
  const qb = { width: 36, height: 36, alignItems: "center", justifyContent: "center" };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      {ids.map((id) => {
        const p = products[id], m = metaFor(p.id);
        return (
          <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.line }}>
            <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: m.t, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 28 }}>{m.e}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink }}>{p.name}</Text>
              <Text style={{ color: t.muted }}>{inr(p.price_paise)} each</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: t.line, borderRadius: 8 }}>
              <Pressable style={qb} accessibilityLabel="Decrease quantity" onPress={() => dispatch({ type: "dec", id })}><Text style={{ color: t.ink, fontSize: 20 }}>−</Text></Pressable>
              <Text style={{ color: t.ink, minWidth: 22, textAlign: "center" }}>{cart[id]}</Text>
              <Pressable style={qb} accessibilityLabel="Increase quantity" onPress={() => dispatch({ type: "add", id })}><Text style={{ color: t.ink, fontSize: 20 }}>+</Text></Pressable>
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={{ color: t.muted }}>Delivery</Text><Text style={{ color: t.ink }}>{ship ? inr(ship) : "Free"}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>Total</Text>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "800" }}>{inr(sub + ship)}</Text>
      </View>
      <Pressable onPress={onCheckout} accessibilityRole="button" style={{ backgroundColor: t.brand, padding: 14, borderRadius: 12, alignItems: "center", marginTop: 8 }}>
        <Text style={{ color: t.onBrand, fontWeight: "700" }}>Continue to delivery</Text>
      </Pressable>
    </ScrollView>
  );
}

function Detail({ p, onClose }) {
  const t = useTheme();
  const { dispatch } = useCart();
  const m = metaFor(p.id);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Pressable onPress={onClose} accessibilityRole="button" style={{ alignSelf: "flex-end" }}><Text style={{ color: t.brand, fontWeight: "700" }}>Close</Text></Pressable>
        <View style={{ height: 220, borderRadius: 16, backgroundColor: m.t, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 96 }}>{m.e}</Text></View>
        <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800" }}>{p.name}</Text>
        <Text style={{ color: t.ink, fontSize: 22, fontWeight: "800" }}>{inr(p.price_paise)}</Text>
        <Text style={{ color: t.muted, fontSize: 16, lineHeight: 22 }}>{m.d}</Text>
        <Pressable disabled={p.stock <= 0} onPress={() => { dispatch({ type: "add", id: p.id }); onClose(); }} accessibilityRole="button"
          style={{ backgroundColor: t.accent, padding: 14, borderRadius: 12, alignItems: "center", opacity: p.stock <= 0 ? 0.5 : 1 }}>
          <Text style={{ color: t.onAccent, fontWeight: "700" }}>{p.stock <= 0 ? "Out of stock" : "Add to cart"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Main() {
  const t = useTheme();
  const { count } = useCart();
  const [tab, setTab] = useState("shop");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [checkout, setCheckout] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setList(await getProducts()); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const byId = useMemo(() => Object.fromEntries(list.map((p) => [p.id, p])), [list]);
  const tabBtn = (k, label) => (
    <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={{ flex: 1, padding: 14, alignItems: "center" }}>
      <Text style={{ color: tab === k ? t.brand : t.muted, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style="auto" />
      <View style={{ backgroundColor: t.brand, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text style={{ color: t.onBrand, fontSize: 22, fontWeight: "800" }}>Cartwell</Text>
      </View>
      <View style={{ flex: 1 }}>
        {tab === "shop" ? <Shop products={list} loading={loading} error={error} reload={reload} onOpen={setOpen} />
          : tab === "cart" ? <CartView products={byId} onCheckout={() => setCheckout(true)} />
          : <Account />}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.card }}>
        {tabBtn("shop", "Shop")}{tabBtn("cart", `Cart (${count})`)}{tabBtn("account", "Account")}
      </View>
      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>{open && <Detail p={open} onClose={() => setOpen(null)} />}</Modal>
      <Modal visible={checkout} animationType="slide" onRequestClose={() => setCheckout(false)}>
        <Checkout products={byId} onClose={() => { setCheckout(false); reload(); }} />
      </Modal>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider><CartProvider><Main /></CartProvider></AuthProvider>
    </SafeAreaProvider>
  );
}
