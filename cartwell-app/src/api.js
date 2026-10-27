import * as SecureStore from "expo-secure-store";

const BASE = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
const RT_KEY = "cartwell.refresh";
let accessToken = null; // kept in memory only; the refresh token lives in the device's secure storage
let onSessionLost = () => {};
export const setSessionLostHandler = (fn) => { onSessionLost = fn; };

async function raw(path, options = {}, token = null) {
  if (!BASE) throw new Error("App is not configured. Set EXPO_PUBLIC_API_URL.");
  if (!__DEV__ && !BASE.startsWith("https://")) throw new Error("Insecure API address.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(BASE + path, {
      ...options,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong. Please try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The server took too long to respond. Check your connection.");
    if (e instanceof TypeError) throw new Error("Can’t reach the server. Check your connection.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveSession(s) {
  accessToken = s.accessToken;
  await SecureStore.setItemAsync(RT_KEY, s.refreshToken);
}
export async function clearSession() {
  accessToken = null;
  await SecureStore.deleteItemAsync(RT_KEY).catch(() => {});
}

let refreshing = null; // one refresh at a time, because refresh tokens rotate
function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await SecureStore.getItemAsync(RT_KEY);
      if (!rt) { const e = new Error("no session"); e.status = 401; throw e; }
      const s = await raw("/api/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: rt }) });
      await saveSession(s);
      return s;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function restoreSession() {
  try { return await refresh(); }
  catch (e) { if (e.status === 401) await clearSession(); return null; }
}

async function call(path, options = {}, { auth = false, optional = false } = {}) {
  const useToken = auth || (optional && !!accessToken);
  try {
    return await raw(path, options, useToken ? accessToken : null);
  } catch (e) {
    if (e.status === 401 && useToken) {
      try { await refresh(); }
      catch (e2) {
        if (e2.status === 401) { await clearSession(); onSessionLost(); throw new Error("Please sign in again."); }
        throw e2;
      }
      return raw(path, options, accessToken);
    }
    throw e;
  }
}
const post = (path, body, opts) => call(path, { method: "POST", body: JSON.stringify(body) }, opts);

export const getProducts = () => call("/api/products");
export const createOrder = (items, customer) => post("/api/orders", { items, customer }, { optional: true });
export const verifyPayment = (p) => post("/api/payments/verify", p);
export const getOrderStatus = (id) => call(`/api/orders/${encodeURIComponent(id)}/status`);

export const register = (b) => post("/api/auth/register", b);
export const login = (b) => post("/api/auth/login", b);
export const requestOtp = (phone) => post("/api/auth/otp/request", { phone });
export const verifyOtp = (phone, code) => post("/api/auth/otp/verify", { phone, code });
export const forgotPassword = (email) => post("/api/auth/password/forgot", { email });
export const resetPassword = (b) => post("/api/auth/password/reset", b);
export const googleSignIn = (idToken) => post("/api/auth/google", { idToken });
export const updateName = (name) => call("/api/me", { method: "PATCH", body: JSON.stringify({ name }) }, { auth: true });
export const changePassword = (b) => post("/api/me/password", b, { auth: true });
export const getAddresses = () => call("/api/me/addresses", {}, { auth: true });
export const addAddress = (b) => post("/api/me/addresses", b, { auth: true });
export const updateAddress = (id, b) => call(`/api/me/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) }, { auth: true });
export const deleteAddress = (id) => call(`/api/me/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }, { auth: true });
export const setDefaultAddress = (id) => post(`/api/me/addresses/${encodeURIComponent(id)}/default`, {}, { auth: true });
export const getMyOrders = () => call("/api/me/orders", {}, { auth: true });
export async function logout() {
  const rt = await SecureStore.getItemAsync(RT_KEY).catch(() => null);
  if (rt) await post("/api/auth/logout", { refreshToken: rt }).catch(() => {}); // still sign out locally if offline
  await clearSession();
}
