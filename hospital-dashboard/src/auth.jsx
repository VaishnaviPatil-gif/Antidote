import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as api from "./api.js";

const AuthContext = createContext(null);

/**
 * Auth state for the dashboard. Holds the current hospital session (token +
 * identity), restored from localStorage on load and validated against the
 * backend so a stale token logs the user out cleanly.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { username, hospital_id, name }
  const [ready, setReady] = useState(false);

  // Validate any stored token on first load.
  useEffect(() => {
    let alive = true;
    if (!api.getToken()) { setReady(true); return undefined; }
    api.me()
      .then((who) => { if (alive) setUser(who); })
      .catch(() => { api.setToken(null); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password);
    api.setToken(res.token);
    setUser({ username, hospital_id: res.hospital_id, name: res.name });
    return res;
  }, []);

  const signup = useCallback(async (signupData) => {
    const res = await api.signup(signupData);
    api.setToken(res.token);
    setUser({ username: signupData.username.toLowerCase(), hospital_id: res.hospital_id, name: res.name });
    return res;
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, isAdmin: user?.hospital_id == null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
