/**
 * ttsService — one text-to-speech entry point for the whole app.
 *
 * Why this exists: the app used raw window.speechSynthesis, which works in
 * desktop browsers but is completely ABSENT in the Android Capacitor WebView
 * ("Voice not available on this device"). This service abstracts that away:
 *
 *   • Android/iOS (native)  → @capacitor-community/text-to-speech (OS engine)
 *   • Web / desktop browser → window.speechSynthesis fallback
 *
 * Public API (platform-agnostic, all async where it matters):
 *   speak(text, language)  — speak `text`; stops anything already playing first
 *   stop()                 — stop immediately
 *   isSpeaking()           — boolean, current speaking state
 *
 * Language codes accepted: "en" | "hi" | "te" (or full BCP-47 like "hi-IN").
 * If a requested language/voice isn't installed on the device, playback falls
 * back to English rather than failing silently.
 */

import { Capacitor } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

// Short language key → BCP-47 locale used by both engines.
const LOCALE = {
  en: "en-US",
  hi: "hi-IN",
  te: "te-IN",
};

/** Normalise "hi", "hi-IN", "HI" … → a supported short key (defaults to en). */
function langKey(language) {
  const l = (language || "en").toLowerCase();
  if (l.startsWith("hi")) return "hi";
  if (l.startsWith("te")) return "te";
  return "en";
}

/** True when running inside a native Capacitor shell (Android/iOS), not web. */
const isNative = Capacitor?.isNativePlatform?.() === true;

// Track speaking state ourselves so isSpeaking() is synchronous and reliable
// across both engines (the native plugin exposes isSpeaking() as a Promise; we
// keep a local mirror so callers can render instantly).
let speaking = false;

// ── Web fallback (browser speechSynthesis) — the ONLY place it is touched ────
const webSynth =
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

/** Load web voices (they arrive asynchronously in most browsers). */
function webVoices() {
  try {
    return webSynth ? webSynth.getVoices() || [] : [];
  } catch {
    return [];
  }
}

/** Pick the best web voice for a locale, with a graceful en fallback. */
function pickWebVoice(locale) {
  const voices = webVoices();
  if (!voices.length) return null;
  const want = locale.toLowerCase();
  const base = want.split("-")[0];
  return (
    voices.find((v) => v.lang?.toLowerCase() === want) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(base)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
    voices[0] ||
    null
  );
}

// Resolver of the in-flight web utterance, so stop() can settle a pending
// speak() promise immediately (cancel() doesn't reliably fire 'end').
let webResolve = null;

function webSpeak(text, locale) {
  return new Promise((resolve) => {
    if (!webSynth) {
      resolve(false);
      return;
    }
    webSynth.cancel(); // guarantee a single active utterance
    const settle = (ok) => {
      if (webResolve === resolve) webResolve = null;
      resolve(ok);
    };
    webResolve = resolve;
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickWebVoice(locale);
    // If the requested language has no voice, fall back to English so we never
    // go silent (the plugin does the same natively).
    u.voice = voice || null;
    u.lang = voice?.lang || (locale.startsWith("en") ? locale : "en-US");
    u.rate = 0.95;
    u.onend = () => settle(true);
    u.onerror = () => settle(false);
    webSynth.speak(u);
  });
}

// Cache of native language-support checks (locale → boolean) so we query the OS
// engine at most once per locale instead of before every sentence.
const nativeSupport = new Map();

/**
 * Resolve the locale to actually speak on native: the requested one if the OS
 * TTS engine supports it, otherwise "en-US". This is where the English fallback
 * happens — deterministically, before speaking — so a missing te-IN/hi-IN pack
 * never surfaces as "voice unavailable".
 * @param {string} locale
 * @returns {Promise<string>}
 */
async function resolveNativeLocale(locale) {
  if (locale === "en-US") return "en-US";
  if (!nativeSupport.has(locale)) {
    try {
      const { supported } = await TextToSpeech.isLanguageSupported({ lang: locale });
      nativeSupport.set(locale, !!supported);
    } catch {
      nativeSupport.set(locale, false);
    }
  }
  return nativeSupport.get(locale) ? locale : "en-US";
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Speak `text` in `language`. Any current speech is stopped first, so calls can
 * never overlap. Resolves when playback finishes (or is superseded/stopped).
 * @param {string} text
 * @param {"en"|"hi"|"te"|string} language
 */
export async function speak(text, language) {
  if (!text) return;
  await stop(); // prevent overlapping speech

  const key = langKey(language);
  const locale = LOCALE[key];
  speaking = true;

  if (isNative) {
    // Decide the locale BEFORE speaking. We must NOT "retry in English" from a
    // catch block: TextToSpeech.stop() rejects the in-flight speak() promise, so
    // a catch-retry would make pressing Stop start speaking English. Instead we
    // pre-resolve to a supported locale (en-US fallback) and speak exactly once.
    const useLocale = await resolveNativeLocale(locale);
    try {
      await TextToSpeech.speak({
        text,
        lang: useLocale,
        rate: 1.0,
        pitch: 1.0,
        category: "playback",
      });
    } catch {
      // Rejection here is normal on stop()/interruption, or a one-off engine
      // error. Do NOT retry — that would speak after the user pressed Stop.
    }
    speaking = false;
    return;
  }

  // Web fallback.
  await webSpeak(text, locale);
  speaking = false;
}

/** Stop any current speech immediately, on either engine. */
export async function stop() {
  speaking = false;
  if (isNative) {
    try {
      await TextToSpeech.stop();
    } catch {
      /* nothing playing */
    }
    return;
  }
  if (webSynth) {
    try {
      webSynth.cancel();
    } catch {
      /* no-op */
    }
    // Settle any pending speak() promise so a per-sentence chain never hangs.
    if (webResolve) {
      const r = webResolve;
      webResolve = null;
      r(false);
    }
  }
}

/** @returns {boolean} whether speech is currently playing. */
export function isSpeaking() {
  return speaking;
}

/**
 * TTS is available on every native platform (OS engine) and on any web browser
 * that implements speechSynthesis. Used by the UI to decide whether to show the
 * control at all — on native this is always true.
 */
export function isTtsAvailable() {
  return isNative || !!webSynth;
}
