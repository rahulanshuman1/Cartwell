import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useAuth } from "./auth";
import { forgotPassword, resetPassword } from "./api";
import { useTheme } from "./theme";
import PasswordInput from "./PasswordInput";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ResetScreen({ onBack }) {
  const t = useTheme();
  const { adopt } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function submit() {
    if (!EMAIL.test(email.trim())) { setOk(false); return setMsg("Enter a valid email address."); }
    if (sent) {
      if (!/^\d{6}$/.test(code)) { setOk(false); return setMsg("Enter the 6-digit code."); }
      if (password.length < 8) { setOk(false); return setMsg("Use a password of at least 8 characters."); }
    }
    setBusy(true); setMsg("");
    try {
      if (!sent) {
        await forgotPassword(email.trim());
        setSent(true); setOk(true);
        setMsg("If an account exists for this email, a code is on its way. It expires in 15 minutes.");
      } else {
        await adopt(await resetPassword({ email: email.trim(), code, password })); // signs the person in
      }
    } catch (e) { setOk(false); setMsg(e.message); } finally { setBusy(false); }
  }

  const input = { backgroundColor: t.card, color: t.ink, borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 12 };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.ink, fontSize: 26, fontWeight: "800" }}>Reset password</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={t.muted} maxLength={80} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!sent} style={input} />
      {sent && (
        <>
          <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} placeholder="6-digit code from your email" placeholderTextColor={t.muted} maxLength={6} keyboardType="number-pad" textContentType="oneTimeCode" style={input} />
          <PasswordInput value={password} onChangeText={setPassword} placeholder="New password (8+ characters)" placeholderTextColor={t.muted} maxLength={128} autoComplete="new-password" style={input} />
        </>
      )}
      <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={{ backgroundColor: t.brand, padding: 14, borderRadius: 12, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color={t.onBrand} /> : <Text style={{ color: t.onBrand, fontWeight: "700" }}>{sent ? "Reset password" : "Send reset code"}</Text>}
      </Pressable>
      {!!msg && <Text accessibilityLiveRegion="polite" style={{ color: ok ? t.muted : t.danger }}>{msg}</Text>}
      <Pressable accessibilityRole="button" onPress={onBack}><Text style={{ color: t.brand, textAlign: "center", fontWeight: "700" }}>Back to sign in</Text></Pressable>
    </ScrollView>
  );
}
