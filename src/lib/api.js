/**
 * Frontend API client for the thin FastAPI Gemini proxy.
 *
 * Both calls are GRACEFUL: on any failure (offline, backend down, bad shape)
 * they resolve to a safe value rather than throwing, so the UI keeps working
 * with on-device fallbacks. The Vite dev server proxies /api → :8000, and the
 * GEMINI_API_KEY never leaves the backend.
 */

/**
 * Base URL of the backend. Empty in dev so requests stay relative (/api/…) and
 * ride the Vite proxy. In a packaged build (Android APK / static host) there is
 * no proxy, so set VITE_API_BASE to the hosted backend, e.g.
 *   VITE_API_BASE=https://api.antidote.example
 * Otherwise the AI calls silently fall back and Gemini appears to do nothing.
 */
import {
  identifyWithGemini,
  summarizeWithGemini,
  evaluateSeverityWithGemini,
  hasClientGeminiKey,
} from "./gemini.js";

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");

/**
 * fetch() with a hard timeout so a slow/unreachable backend (very common on a
 * physical phone that can't reach the dev server) fails fast and visibly instead
 * of hanging. Image analysis is slow, so callers pass a generous timeout.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Safe default identification, mirroring the backend contract exactly. */
const SAFE_DEFAULT = {
  species: "Unidentified",
  common_name: "Unidentified",
  scientific_name: null,
  reasoning: ["Insufficient visual evidence."],
  validation_status: "Fallback Active",
  validation_reason: "Process failed",
  confidence: 0,
  venomous: true,
  venom_type: "Unknown (Assume Neurotoxic & Hemotoxic)",
  danger_level: "Critical (Safety Fallback Active)",
  similar_snakes: [],
  typical_habitat: "Rural and agricultural regions of South Asia",
  first_aid_steps: [
    "Keep calm and minimize movement.",
    "Immobilize the bitten limb at or below heart level.",
    "Remove tight jewelry, watches, or clothing.",
    "Reach a medical facility with antivenom immediately.",
    "DO NOT cut, suck, or apply tourniquets."
  ]
};

/**
 * POST /api/identify — analyse a snake photo.
 * Resolves to the safe default (assume venomous) on ANY failure, non-OK
 * response, or unexpected shape. `_failed` flags a transport/parse failure so
 * the UI can show a quiet note without changing the safety behaviour.
 *
 * @param {string} dataUrl - captured image as a data URL
 * @returns {Promise<{species:string,common_name:string,scientific_name:string|null,reasoning:string[],validation_status:string,validation_reason:string|null,confidence:number,venomous:boolean,_failed:boolean}>}
 */
export async function identifySnake(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  // Match the mime to what we actually send (the client compresses to JPEG).
  const mimeMatch = /^data:([^;,]+)[;,]/.exec(String(dataUrl));
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

  // HACKATHON demo path: when a client Gemini key is configured, call Gemini
  // directly (no backend / laptop / USB needed). Remove VITE_GEMINI_API_KEY to
  // revert to the secure backend proxy below. See src/lib/gemini.js.
  console.info(`[identify] path=${hasClientGeminiKey() ? "direct-gemini" : "backend-proxy"}, imageBytes=${base64.length}`);
  if (hasClientGeminiKey()) {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(), 25000);
    try {
      return await identifyWithGemini(base64, mime, { signal: ac.signal });
    } catch (err) {
      const why = err?.name === "AbortError" ? "timed out" : (err?.message || "network error");
      console.warn(`[identify] direct Gemini call failed (${why}). Falling back.`);
      return { ...SAFE_DEFAULT, _failed: true };
    } finally {
      clearTimeout(id);
    }
  }

  const endpoint = `${API_BASE}/api/identify`;
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64, mime }),
    });
    if (!res.ok) {
      // Reachable but the backend rejected it (bad key, 4xx/5xx). Log so a device
      // test can tell "server said no" apart from "couldn't reach server".
      console.warn(`[identify] ${endpoint} → HTTP ${res.status}. Falling back.`);
      return { ...SAFE_DEFAULT, _failed: true };
    }
    const data = await res.json();
    // Pipeline diagnostics (dev only): the exact JSON received from the proxy,
    // which is what the Snake screen renders verbatim (species + confidence).
    if (import.meta.env?.DEV) console.debug("[identify] /api/identify response:", data);
    
    return {
      species: typeof data.species === "string" && data.species ? data.species : "Unidentified",
      common_name: typeof data.common_name === "string" && data.common_name ? data.common_name : "Unidentified",
      scientific_name: typeof data.scientific_name === "string" && data.scientific_name ? data.scientific_name : null,
      reasoning: Array.isArray(data.reasoning) ? data.reasoning : ["Insufficient visual evidence."],
      validation_status: typeof data.validation_status === "string" && data.validation_status ? data.validation_status : "Fallback Active",
      validation_reason: typeof data.validation_reason === "string" && data.validation_reason ? data.validation_reason : null,
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
      venomous: data.venomous === false ? false : true,
      // Upgraded clinical report fields (§ "Upgrade Snake Identification Report").
      // These MUST be forwarded — the Snake screen renders venom type, danger
      // level, habitat, look-alikes and first-aid directly from the API result.
      // Without them a *successful* identification would silently show N/A and
      // the generic fallback first-aid, exactly as if the call had failed.
      venom_type: typeof data.venom_type === "string" && data.venom_type ? data.venom_type : null,
      danger_level: typeof data.danger_level === "string" && data.danger_level ? data.danger_level : null,
      typical_habitat: typeof data.typical_habitat === "string" && data.typical_habitat ? data.typical_habitat : null,
      similar_snakes: Array.isArray(data.similar_snakes) ? data.similar_snakes : [],
      first_aid_steps: Array.isArray(data.first_aid_steps) ? data.first_aid_steps : [],
      _failed: false
    };
  } catch (err) {
    // Transport failure — almost always the phone can't reach API_BASE
    // (backend not running, no adb reverse / wrong LAN IP, cleartext blocked,
    // or the 25s timeout). Surface it so it's diagnosable in DevTools instead of
    // silently showing "Unidentified".
    const why = err?.name === "AbortError" ? "timed out" : (err?.message || "network error");
    console.warn(`[identify] request to ${endpoint} failed (${why}). API_BASE="${API_BASE || "(empty→proxy)"}"`);
    return { ...SAFE_DEFAULT, _failed: true };
  }
}

/**
 * POST /api/summarize — get a clinician handover sentence for the symptom log.
 * Resolves to null on any failure so the caller falls back to the local
 * composer (the tracker never depends on the backend to function).
 *
 * @param {Array} symptomLog
 * @param {Date|string|null} biteTime
 * @param {string} language
 * @returns {Promise<{text:string, source:string}|null>}
 */
export async function summarizeSymptoms(symptomLog, biteTime, language) {
  // Direct-Gemini demo path (no backend). Falls through to null → local composer.
  if (hasClientGeminiKey()) {
    try {
      return await summarizeWithGemini(symptomLog, biteTime);
    } catch (err) {
      console.warn(`[summarize] direct Gemini failed: ${err?.message || err}`);
      return null;
    }
  }
  try {
    const res = await fetch(`${API_BASE}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptomLog, biteTime, language }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && typeof data.summary === "string" && data.summary) {
      return { text: data.summary, source: data.source || "gemini" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * POST /api/severity — AI Severity Engine.
 */
export async function evaluateSeverity(symptoms, snake, minsSinceBite, swellingProgression) {
  // Direct-Gemini demo path (no backend). Falls through to null → local engine.
  if (hasClientGeminiKey()) {
    try {
      return await evaluateSeverityWithGemini(symptoms, snake, minsSinceBite, swellingProgression);
    } catch (err) {
      console.warn(`[severity] direct Gemini failed: ${err?.message || err}`);
      return null;
    }
  }
  try {
    const res = await fetch(`${API_BASE}/api/severity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symptoms,
        snake,
        mins_since_bite: minsSinceBite,
        swelling_progression: swellingProgression
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
