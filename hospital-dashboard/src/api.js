// API client for the hospital dashboard. Talks to the same FastAPI backend the
// phone app uses. In dev, requests are relative (/api/*) and Vite proxies them
// to :8000; for a hosted build set VITE_API_BASE to the deployed backend.

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");
const TOKEN_KEY = "antidote.dash.token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const tok = getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error("Session expired — please log in again.");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ── Auth ──
export function login(username, password) {
  return request("/api/auth/login", { method: "POST", body: { username, password }, auth: false });
}
export function signup(signupData) {
  return request("/api/auth/signup", { method: "POST", body: signupData, auth: false });
}
export function me() {
  return request("/api/auth/me");
}

// ── Hospitals / stock ──
export function fetchHospitals() {
  return request("/api/hospitals", { auth: false });
}
export function updateStock(hospitalId, { vials, beds }) {
  const body = { vials };
  if (typeof beds === "number") body.beds = beds;
  return request(`/api/hospitals/${encodeURIComponent(hospitalId)}/stock`, { method: "POST", body });
}

// ── Incoming cases ──
export function fetchCases() {
  return request("/api/cases");
}
export function updateCase(caseData) {
  return request("/api/cases", { method: "POST", body: caseData, auth: false });
}
