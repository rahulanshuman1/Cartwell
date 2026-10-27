import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./theme";

// Password box with a show/hide eye button. Accepts the same props as TextInput.
export default function PasswordInput({ style, ...props }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View>
      <TextInput {...props} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} style={[style, { paddingRight: 48 }]} />
      <Pressable
        accessibilityRole="button" accessibilityLabel={show ? "Hide password" : "Show password"}
        onPress={() => setShow(!show)} hitSlop={8}
        style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}>
        <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={22} color={t.muted} />
      </Pressable>
    </View>
  );
}
