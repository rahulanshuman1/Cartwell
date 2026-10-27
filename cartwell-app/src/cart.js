import React, { createContext, useContext, useEffect, useReducer, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "cartwell.cart.v1";
const Ctx = createContext(null);

function reducer(state, a) {
  switch (a.type) {
    case "load": return a.cart;
    case "add": return { ...state, [a.id]: Math.min(10, (state[a.id] || 0) + 1) };
    case "dec": {
      const q = (state[a.id] || 0) - 1;
      const next = { ...state };
      if (q <= 0) delete next[a.id]; else next[a.id] = q;
      return next;
    }
    case "clear": return {};
    default: return state;
  }
}

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(reducer, {});
  const ready = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      try {
        const v = JSON.parse(raw || "{}"), clean = {};
        for (const k of Object.keys(v)) {
          const id = Number(k), q = Math.floor(Number(v[k]));
          if (Number.isInteger(id) && id > 0 && q > 0 && q <= 10) clean[id] = q;
        }
        dispatch({ type: "load", cart: clean });
      } catch { /* ignore corrupt data */ }
    }).finally(() => { ready.current = true; });
  }, []);

  useEffect(() => { if (ready.current) AsyncStorage.setItem(KEY, JSON.stringify(cart)).catch(() => {}); }, [cart]);

  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  return <Ctx.Provider value={{ cart, dispatch, count }}>{children}</Ctx.Provider>;
}
export const useCart = () => useContext(Ctx);
