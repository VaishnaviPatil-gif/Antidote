/**
 * Direct client-side Gemini vision call — HACKATHON DEMO PATH ONLY.
 *
 * Normally the FastAPI backend proxies this so the API key stays secret. For the
 * 2-day demo we call Gemini straight from the app using VITE_GEMINI_API_KEY, so
 * the demo needs no backend / laptop / USB and works over any internet.
 *
 * ⚠️  The key is baked into the app bundle and can be extracted from the APK.
 *     Restrict it (Gemini API only + low quota) and ROTATE/DELETE it right after
 *     the event. Remove VITE_GEMINI_API_KEY to revert to the secure backend proxy.
 *
 * Mirrors the backend's prompt + accept/fallback logic so identification quality
 * and the returned shape are identical to /api/identify.
 */

// Override with VITE_GEMINI_MODEL if 2.5-flash isn't enabled on your key
// (e.g. try "gemini-2.0-flash" or "gemini-1.5-flash").
const MODEL = (import.meta.env?.VITE_GEMINI_MODEL || "gemini-2.5-flash").trim();
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

// Demo-tuned identification prompt. The backend's prompt refuses below 90%
// confidence (safe for production, but it rejects most real phone photos). Here
// we ask for a BEST-GUESS identification at a lower bar, while keeping the
// safety-first rule (assume venomous when unsure) so the clinical advice never
// becomes unsafe. Verified: still identifies a clear cobra at ~98% confidence.
const IDENTIFY_PROMPT =
  "You are an expert Indian herpetologist assisting Antidote+, an emergency " +
  "snakebite app. Give your BEST identification of the snake in the image. " +
  "Identify the species when you can see enough features to make a reasonable " +
  "call (confidence >= 55). Only set identified=false if NO snake is visible, or " +
  "the image is far too blurry/dark to guess at all. PATIENT SAFETY FIRST: when " +
  "you are unsure whether the snake is venomous, set venomous=true.\n" +
  "Base the identification on visible features: head shape; hood; neck; body " +
  "thickness; scale texture; colour; dorsal/belly markings; bands; diamonds; " +
  "zig-zag patterns; spectacle mark; chevrons; and any distinctive cues.\n" +
  "OUTPUT - return ONLY valid minified JSON, with no text outside it.\n" +
  'If identified: {"identified":true,"species":<name>,"common_name":<common ' +
  'name>,"scientific_name":<latin name>,"venomous":<true|false>,"confidence":' +
  '<55-100>,"reasoning":[<visible cues you saw>],"venom_type":<Neurotoxic|' +
  'Hemotoxic|Cytotoxic|Mixed|None>,"danger_level":<Critical|Highly Dangerous|' +
  'Moderately Dangerous|Harmless>,"similar_snakes":[<1-2 look-alikes>],' +
  '"typical_habitat":<short habitat>,"first_aid_steps":[<3-5 safety-first ' +
  'steps>]}.\n' +
  'Otherwise: {"identified":false,"confidence":<0-54>,"reason":"Image too ' +
  'unclear to identify the snake."}.';

const SAFE_FIRST_AID = [
  "Keep calm and minimize movement.",
  "Immobilize the bitten limb at or below heart level.",
  "Remove tight jewelry, watches, or clothing.",
  "Reach a medical facility with antivenom immediately.",
  "DO NOT cut, suck, or apply tourniquets.",
];

/** Safe fallback identification (assume venomous), matching the backend contract. */
export const SAFE_DEFAULT = {
  species: "Unidentified",
  common_name: "Unidentified",
  scientific_name: null,
  reasoning: ["Insufficient visual evidence."],
  validation_status: "Fallback Active",
  validation_reason: "Below safe identification threshold",
  confidence: 0,
  venomous: true,
  venom_type: "Unknown (Assume Neurotoxic & Hemotoxic)",
  danger_level: "Critical (Safety Fallback Active)",
  similar_snakes: [],
  typical_habitat: "Rural and agricultural regions of South Asia",
  first_aid_steps: SAFE_FIRST_AID,
};

/** True when a client-side Gemini key is configured (demo mode). */
export function hasClientGeminiKey() {
  return !!(import.meta.env?.VITE_GEMINI_API_KEY || "").trim();
}

const toList = (v, fallback) =>
  Array.isArray(v) ? v.map((x) => String(x)).filter((s) => s.trim()) : fallback;

/** Pull the first {...} JSON object out of model text (defensive vs. stray prose/fences). */
function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Map Gemini's raw JSON to the app's identification shape (same rules as backend). */
function mapIdentification(parsed) {
  if (!parsed || typeof parsed !== "object") return { ...SAFE_DEFAULT, _failed: false };

  const rawConf = typeof parsed.confidence === "number" ? parsed.confidence : null;
  // Prompt returns 0-100; normalise to 0-1 (tolerate a model that already sent 0-1).
  const confidence = rawConf == null ? 0 : rawConf > 1 ? rawConf / 100 : rawConf;
  const species = String(parsed.common_name || parsed.species || "Unidentified").trim() || "Unidentified";
  // Demo threshold: trust the model's own identified flag with a low confidence
  // floor (the prompt already only sets identified=true at >=55%). The backend
  // uses a stricter 0.9 bar for production.
  const accept = parsed.identified === true && species !== "Unidentified" && confidence >= 0.5;

  if (accept) {
    const venomous = parsed.venomous === false ? false : true;
    return {
      species,
      common_name: String(parsed.common_name || parsed.species || "Unidentified").trim(),
      scientific_name: String(parsed.scientific_name || "").trim() || null,
      reasoning: toList(parsed.reasoning, ["Identified from visible features."]),
      validation_status: "Validated",
      validation_reason: null,
      confidence,
      venomous,
      venom_type: String(parsed.venom_type || (venomous ? "Neurotoxic & Hemotoxic" : "None")).trim(),
      danger_level: String(parsed.danger_level || (venomous ? "Highly Dangerous" : "Harmless")).trim(),
      similar_snakes: toList(parsed.similar_snakes, []),
      typical_habitat: String(parsed.typical_habitat || "Vikarabad region").trim(),
      first_aid_steps: toList(parsed.first_aid_steps, SAFE_FIRST_AID),
      _failed: false,
    };
  }

  // Model responded but didn't confidently identify → fail closed (assume venomous),
  // but PRESERVE its confidence so the UI can show "AI confidence NN%, below threshold".
  // _failed stays false: the call succeeded, it just didn't reach the ID bar.
  return {
    ...SAFE_DEFAULT,
    confidence: confidence || 0,
    reasoning: [parsed.reason || "Insufficient visual evidence for safe identification."],
    validation_reason: parsed.reason || "Below safe identification threshold",
    _failed: false,
  };
}

/**
 * Low-level Gemini generateContent call. Returns the model's text output.
 * Logs status + a response snippet so a device demo is diagnosable in DevTools.
 * @throws on missing key / non-OK / transport error.
 */
async function generate(parts, { signal, jsonMode = false, temperature = 0 } = {}) {
  const key = (import.meta.env?.VITE_GEMINI_API_KEY || "").trim();
  if (!key) throw new Error("no client Gemini key");

  const generationConfig = { temperature };
  if (jsonMode) generationConfig.responseMimeType = "application/json";

  const res = await fetch(ENDPOINT(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[gemini] HTTP ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`gemini HTTP ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") || "";
  console.info(`[gemini] ok, ${text.length} chars ->`, text.slice(0, 200));
  return text;
}

/**
 * Identify a snake by calling Gemini vision directly from the client.
 * @param {string} base64  image bytes, no data-URL prefix
 * @param {string} mime    e.g. "image/jpeg"
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<object>} identification result in the app's shape
 * @throws on transport / non-OK / no key (caller falls back to SAFE_DEFAULT + _failed)
 */
export async function identifyWithGemini(base64, mime, { signal } = {}) {
  const text = await generate(
    [
      { text: IDENTIFY_PROMPT },
      { inline_data: { mime_type: mime || "image/jpeg", data: base64 } },
    ],
    { signal, jsonMode: true }
  );
  return mapIdentification(extractJson(text));
}

// ── Clinician summary (Tracker) ──────────────────────────────────────────────
const SUMMARIZE_PROMPT =
  "You are a clinical assistant for a snakebite emergency app. In ONE concise " +
  "sentence (max ~40 words), summarise the patient's monitoring log for a " +
  "receiving clinician: time since bite, key symptoms and their progression, and " +
  "a brief impression. Plain text only, no markdown, no preamble. Data: ";

/**
 * Direct-Gemini clinician summary. Returns {text, source} or null (caller then
 * uses the on-device composer).
 */
export async function summarizeWithGemini(symptomLog, biteTime, { signal } = {}) {
  const text = await generate(
    [{ text: SUMMARIZE_PROMPT + JSON.stringify({ biteTime, symptomLog }) }],
    { signal }
  );
  const t = (text || "").trim();
  return t ? { text: t, source: "gemini" } : null;
}

// ── Severity engine (Tracker) ────────────────────────────────────────────────
const SEVERITY_PROMPT =
  "You are an expert clinical toxicologist specializing in snakebite envenomation triage.\n" +
  "Evaluate the clinical severity based on the following input:\n" +
  "Inputs:\n" +
  "- Symptoms: {symptoms}\n" +
  "- Snake Identification: {snake}\n" +
  "- Time Since Bite: {time_since_bite}\n" +
  "- Swelling Progression: {swelling_progression}\n\n" +
  "Output valid JSON matching this schema:\n" +
  '{"severity":"Mild"|"Moderate"|"Severe"|"Critical","confidence":<float 0.0-1.0>,' +
  '"reasoning":[<short clinical bullet points>]}\n\n' +
  "Safety Guidelines (Safety-First):\n" +
  "1. CRITICAL: If there are systemic neurotoxic signs (ptosis, slurred speech, " +
  "drowsiness, breathing issues) OR significant bleeding, severity must be Severe or Critical.\n" +
  "2. If the snake is highly venomous (Russell's Viper, Indian Cobra, Saw-scaled " +
  "Viper, Common Krait) with systemic symptoms, evaluate as Severe or Critical. If no " +
  "symptoms yet but bite is recent, rate Moderate or Severe to be safe.\n" +
  "3. Output MUST be valid JSON only, no markdown, no extra text.";

/**
 * Direct-Gemini severity assessment. Returns the same shape as /api/severity,
 * or null on any problem (caller falls back to the local engine).
 */
export async function evaluateSeverityWithGemini(symptoms, snake, minsSinceBite, swellingProgression, { signal } = {}) {
  const prompt = SEVERITY_PROMPT
    .replace("{symptoms}", JSON.stringify(symptoms || {}))
    .replace("{snake}", snake ? JSON.stringify(snake) : "None")
    .replace("{time_since_bite}", `${minsSinceBite} minutes`)
    .replace("{swelling_progression}", swellingProgression || "unknown");

  const text = await generate([{ text: prompt }], { signal, jsonMode: true });
  const data = extractJson(text);
  if (!data || !data.severity) return null;

  const sev = String(data.severity);
  const severity = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();
  if (!["Mild", "Moderate", "Severe", "Critical"].includes(severity)) return null;

  let confidence = Number(data.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.85;

  const reasoning = Array.isArray(data.reasoning)
    ? data.reasoning.map(String)
    : data.reasoning ? [String(data.reasoning)] : [];

  return {
    severity,
    confidence,
    reasoning: reasoning.length ? reasoning : ["Assessment based on reported symptoms."],
    disclaimer: "Never replace professional medical advice. Always remain safety-first.",
    source: "gemini",
  };
}
