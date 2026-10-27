import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "./auth";
import { register, login, requestOtp, verifyOtp, googleSignIn } from "./api";
import { getGoogleIdToken } from "./google";
import { useTheme } from "./theme";
import ResetScreen from "./ResetScreen";
import PasswordInput from "./PasswordInput";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const t = useTheme();
  const { adopt } = useAuth();
  const [mode, setMode] = useState("email");
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function run(fn) {
    setBusy(true); setMsg("");
    try { await fn(); } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  const submitEmail = () => {
    if (isNew && name.trim().length < 2) return setMsg("Enter your full name.");
    if (!EMAIL.test(email.trim())) return setMsg("Enter a valid email address.");
    if (password.length < 8) return setMsg("Use a password of at least 8 characters.");
    run(async () => adopt(isNew
      ? await register({ name: name.trim(), email: email.trim(), password })
      : await login({ email: email.trim(), password })));
  };
  const sendCode = () => {
    if (!/^[6-9]\d{9}$/.test(phone)) return setMsg("Enter a 10-digit Indian mobile number.");
    run(async () => { await requestOtp(phone); setSent(true); setCode(""); setWait(60); });
  };
  const checkCode = () => {
    if (!/^\d{6}$/.test(code)) return setMsg("Enter the 6-digit code.");
    run(async () => adopt(await verifyOtp(phone, code)));
  };
  const google = () => run(async () => {
    const idToken = await getGoogleIdToken();
    if (idToken) await adopt(await googleSignIn(idToken));
  });

  if (forgot) return <ResetScreen onBack={() => setForgot(false)} />;

  const input = { backgroundColor: t.card, color: t.ink, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12 };
  const primary = { backgroundColor: t.brand, padding: 14, borderRadius: 12, alignItems: "center", opacity: busy ? 0.6 : 1 };
  const seg = (on) => ({ flex: 1, padding: 10, alignItems: "center", borderRadius: 8, backgroundColor: on ? t.brand : "transparent" });
  const Btn = ({ onPress, label, style, color }) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={style}>
      {busy ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: "700" }}>{label}</Text>}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800" }}>Sign in to Cartwell</Text>
      <Text style={{ color: t.muted }}>See your orders and check out faster. You can also check out as a guest.</Text>

      <Pressable accessibilityRole="button" disabled={busy} onPress={google}
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 14, borderRadius: 12, alignItems: "center" }}>
        <Text style={{ color: t.ink, fontWeight: "700" }}>Continue with Google</Text>
      </Pressable>
      <Text style={{ color: t.muted, textAlign: "center" }}>or</Text>

      <View style={{ flexDirection: "row", borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 3 }}>
        {[["email", "Email"], ["phone", "Phone"]].map(([k, l]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: mode === k }} onPress={() => { setMode(k); setMsg(""); }} style={seg(mode === k)}>
            <Text style={{ color: mode === k ? t.onBrand : t.ink, fontWeight: "700" }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "email" ? (
        <View style={{ gap: 10 }}>
          {isNew && <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={t.muted} maxLength={60} autoComplete="name" style={input} />}
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.muted} maxLength={80} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={input} />
          <PasswordInput value={password} onChangeText={setPassword} placeholder="Password (8+ characters)" placeholderTextColor={t.muted} maxLength={128} autoComplete={isNew ? "new-password" : "current-password"} style={input} />
          <Btn onPress={submitEmail} label={isNew ? "Create account" : "Sign in"} style={primary} color={t.onBrand} />
          {!isNew && (
            <Pressable accessibilityRole="button" onPress={() => { setForgot(true); setMsg(""); }}>
              <Text style={{ color: t.brand, textAlign: "center", fontWeight: "700" }}>Forgot password?</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={() => { setIsNew(!isNew); setMsg(""); }}>
            <Text style={{ color: t.brand, textAlign: "center", fontWeight: "700" }}>{isNew ? "I already have an account" : "New here? Create an account"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <TextInput value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ""))} placeholder="10-digit mobile number" placeholderTextColor={t.muted} maxLength={10} keyboardType="number-pad" autoComplete="tel" editable={!sent} style={input} />
          {sent && (
            <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} placeholder="6-digit code" placeholderTextColor={t.muted} maxLength={6} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" style={input} />
          )}
          {sent
            ? <Btn onPress={checkCode} label="Verify and sign in" style={primary} color={t.onBrand} />
            : <Btn onPress={sendCode} label="Send code" style={primary} color={t.onBrand} />}
          {sent && (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Pressable accessibilityRole="button" onPress={() => { setSent(false); setMsg(""); }}><Text style={{ color: t.brand, fontWeight: "700" }}>Change number</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={wait > 0 || busy} onPress={sendCode}>
                <Text style={{ color: wait > 0 ? t.muted : t.brand, fontWeight: "700" }}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: t.danger }}>{msg}</Text>}
    </ScrollView>
  );
}
