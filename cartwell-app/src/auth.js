import React, { createContext, useContext, useEffect, useState } from "react";
import { restoreSession, saveSession, logout, setSessionLostHandler } from "./api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    restoreSession().then((s) => { if (s) setUser(s.user); }).finally(() => setReady(true));
  }, []);

  const adopt = async (s) => { await saveSession(s); setUser(s.user); };
  const signOut = async () => { await logout(); setUser(null); };
  return <Ctx.Provider value={{ user, setUser, ready, adopt, signOut }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
