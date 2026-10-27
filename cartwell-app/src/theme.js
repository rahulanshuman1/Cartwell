import { useColorScheme } from "react-native";

const light = { bg: "#f5f7f6", card: "#ffffff", ink: "#0f1f1c", muted: "#5d6b67", line: "#dde4e1",
  brand: "#0f4c45", onBrand: "#ffffff", accent: "#f2a33a", onAccent: "#2b1a00", danger: "#b42318", ok: "#157347" };
const dark = { bg: "#0c1513", card: "#142320", ink: "#eaf2ef", muted: "#9fb0aa", line: "#264039",
  brand: "#3fb59f", onBrand: "#04211c", accent: "#f2a33a", onAccent: "#2b1a00", danger: "#ff8a80", ok: "#6fd3a0" };

export const useTheme = () => (useColorScheme() === "dark" ? dark : light);
export const inr = (paise) => "₹" + (paise / 100).toLocaleString("en-IN");
