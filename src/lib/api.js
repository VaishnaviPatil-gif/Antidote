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
const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/+$/, "");

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
  try {
    const base64 = String(dataUrl).split(",")[1] || "";
    const res = await fetch(`${API_BASE}/api/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });
    if (!res.ok) return { ...SAFE_DEFAULT, _failed: true };
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
      _failed: false
    };
  } catch {
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
