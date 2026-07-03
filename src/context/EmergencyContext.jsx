import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { saveSession, loadSession, clearSession } from "../lib/session.js";

/**
 * EmergencyContext — the single source of truth that connects every screen,
 * including the existing routing screen (which READS `victimLocation` and
 * `severity`). This is the §3 shared-state contract:
 *
 *   {
 *     language, biteTime, victimLocation, snake, severity,
 *     symptomLog, emergencyContact, ...
 *   }
 *
 * No Redux / Zustand — one lightweight Context as specified. State is mirrored
 * to localStorage so the offline flow (§2.9) survives reloads / lost signal.
 */

const EmergencyContext = createContext(null);

const STORAGE_KEY = "antidote.emergency.v1";

/**
 * sessionStorage marker used to tell a *fresh app launch* apart from in-app
 * navigation. sessionStorage is cleared when the app/tab process is closed (a
 * real restart) but persists across route changes, so the absence of this
 * marker on the provider's first mount means "the app was just (re)opened".
 * Combined with a persisted bite, that's exactly when we offer to resume.
 */
const LIVE_KEY = "antidote.session.live";

/** Debounce window (ms) for durable IndexedDB writes — coalesces bursts. */
const SAVE_DEBOUNCE_MS = 400;

/**
 * Fresh-launch detection, resolved exactly once at module evaluation — before
 * any component (or StrictMode's double-mount) runs, so it can't be flipped by
 * a re-invoked initializer. The marker is absent only when the app process was
 * just (re)started; after that it persists for the lifetime of the app session.
 */
const FRESH_LAUNCH = (() => {
  try {
    const wasLive = sessionStorage.getItem(LIVE_KEY) === "1";
    sessionStorage.setItem(LIVE_KEY, "1");
    return !wasLive;
  } catch {
    return false;
  }
})();

/** Monotonic id source for contacts (unique within an app session). */
let CONTACT_SEQ = 0;
function makeContactId() {
  CONTACT_SEQ += 1;
  return `c_${Date.now().toString(36)}_${CONTACT_SEQ}`;
}

/**
 * Normalise a state object's contacts: guarantee an `emergencyContacts` array
 * (migrating a legacy single `emergencyContact`) and keep `emergencyContact`
 * mirroring the primary (contacts[0]) so the SOS timeline/message never break.
 */
function withContacts(base) {
  const raw = Array.isArray(base.emergencyContacts) && base.emergencyContacts.length
    ? base.emergencyContacts
    : base.emergencyContact
    ? [base.emergencyContact]
    : [];
  const emergencyContacts = raw.map((c, i) => ({
    id: c.id || `mig_${i}`,
    name: c.name || "",
    phone: c.phone || "",
  }));
  return { ...base, emergencyContacts, emergencyContact: emergencyContacts[0] || null };
}

/** Default shape — matches the §3 contract exactly. */
const DEFAULT_STATE = {
  language: "te", // te | hi | en — default Telugu
  biteTime: null, // Date (ISO in storage) | null
  victimLocation: null, // { lat, lng } | null  — routing READS this
  victimLabel: null, // human-readable place name, when known
  snake: null, // { species, confidence, venomous } | null
  severity: "mild", // mild | moderate | severe — routing READS this
  symptomLog: [], // Array<{ t, answers, level }>
  emergencyContacts: [], // Array<{ id, name, phone }> — family members to alert
  emergencyContact: null, // { name, phone } | null — the PRIMARY (contacts[0]), kept
  //                          in sync for the coordination timeline / message.
  recommendedHospital: null, // set by routing so SOS / hospital view can read it
  lastRoute: null, // deepest emergency screen visited — enables "resume" (§P1)
  // Optional patient identifiers for the clinician handover card. Not part of
  // the core emergency flow — captured only if a bystander adds them; absent
  // fields render as "Not Recorded". Persisted for free with the rest of state.
  patientId: null, // string | null
  patientAge: null, // string | null
  patientGender: null, // "male" | "female" | "other" | null
  snakeImage: null, // base64 photo of the snake
};

/**
 * Rehydrate persisted state, converting stored ISO strings back into Dates.
 * Falls back to DEFAULT_STATE on any parse error (corrupt / absent storage).
 */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return withContacts({
      ...DEFAULT_STATE,
      ...parsed,
      biteTime: parsed.biteTime ? new Date(parsed.biteTime) : null,
      symptomLog: Array.isArray(parsed.symptomLog)
        ? parsed.symptomLog.map((e) => ({ ...e, t: new Date(e.t) }))
        : [],
    });
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Provider. Wrap the whole app in this once (in App.jsx).
 * Exposes the state plus narrow, intention-revealing setters so each screen
 * touches only its own slice of the contract.
 */
export function EmergencyProvider({ children }) {
  const [state, setState] = useState(loadState);

  // ── Durable session metadata (Priority 1) ───────────────────────────────
  // `hydrated` gates the IndexedDB writer until we've read any pre-existing
  // durable session, so an empty initial state can't clobber a saved one.
  const [hydrated, setHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);

  // True only on a fresh app launch — see FRESH_LAUNCH / LIVE_KEY. The resume
  // banner pairs this with a persisted bite to decide whether to offer resume.
  // Held in state so `dismissResume` / `resetEmergency` can turn it off.
  const [freshLaunch, setFreshLaunch] = useState(FRESH_LAUNCH);

  // Persist on every change (Dates serialise to ISO via JSON automatically).
  // This synchronous localStorage mirror stays the first-paint source of truth
  // so there is zero regression / no flash if IndexedDB is slow or blocked.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full / unavailable — non-fatal, app keeps working in memory */
    }
  }, [state]);

  // One-time durable hydration. If localStorage was evicted (common on mobile
  // WebViews) but IndexedDB kept the session, restore it. If the synchronous
  // load already produced a live bite, that copy is freshest — keep it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSession();
      if (cancelled) return;
      if (saved) {
        if (saved.meta?.startedAt) setSessionStartedAt(saved.meta.startedAt);
        if (saved.meta?.updatedAt) setLastSavedAt(saved.meta.updatedAt);
        setState((cur) => {
          if (cur.biteTime) return cur; // localStorage copy wins when present
          // Revive Dates the structured clone may not have carried through a
          // localStorage-shaped object (defensive — IndexedDB usually keeps them).
          const s = saved.state || {};
          return withContacts({
            ...DEFAULT_STATE,
            ...s,
            biteTime: s.biteTime ? new Date(s.biteTime) : null,
            symptomLog: Array.isArray(s.symptomLog)
              ? s.symptomLog.map((e) => ({ ...e, t: new Date(e.t) }))
              : [],
          });
        });
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced durable auto-save. Runs only after hydration so it never races
  // the read above. Coalesces rapid edits (e.g. typing a contact) into one IO.
  useEffect(() => {
    if (!hydrated) return undefined;
    const id = setTimeout(() => {
      saveSession(state).then((meta) => {
        if (!meta) return;
        setLastSavedAt(meta.updatedAt);
        setSessionStartedAt((prev) => prev ?? meta.startedAt);
      });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [state, hydrated]);

  const patch = useCallback(
    (next) => setState((s) => ({ ...s, ...next })),
    []
  );

  // ── Slice setters (one per writer screen, per §3) ───────────────────────
  const setLanguage = useCallback((language) => patch({ language }), [patch]);

  /** Home writes biteTime + victimLocation when the victim taps "I've been bitten". */
  const startEmergency = useCallback(
    (location, label) =>
      setState((s) => ({
        ...s,
        biteTime: s.biteTime ?? new Date(), // never reset an existing bite time
        victimLocation: location ?? s.victimLocation,
        victimLabel: label ?? s.victimLabel,
      })),
    []
  );

  const setVictimLocation = useCallback(
    (victimLocation, victimLabel = null) =>
      patch({ victimLocation, victimLabel }),
    [patch]
  );

  /** Snake capture writes the `snake` slice. */
  const setSnake = useCallback((snake) => patch({ snake }), [patch]);

  const setSnakeImage = useCallback((snakeImage) => patch({ snakeImage }), [patch]);

  /** Severity tracker writes `severity` and appends to `symptomLog`. */
  const setSeverity = useCallback((severity) => patch({ severity }), [patch]);

  const appendSymptom = useCallback(
    (entry) =>
      setState((s) => ({
        ...s,
        symptomLog: [...s.symptomLog, entry],
        severity: entry.level ?? s.severity, // keep severity in lockstep
      })),
    []
  );

  const updateSymptomLogEntry = useCallback(
    (index, level, aiSeverity) => {
      setState((s) => {
        const symptomLog = [...s.symptomLog];
        if (symptomLog[index]) {
          symptomLog[index] = {
            ...symptomLog[index],
            level,
            aiSeverity
          };
        }
        return {
          ...s,
          symptomLog,
          severity: index === symptomLog.length - 1 ? level : s.severity
        };
      });
    },
    []
  );

  // ── Emergency contacts (family members to alert) ────────────────────────
  /** Append a family member. First one added becomes the primary automatically. */
  const addEmergencyContact = useCallback((c) => {
    const name = (c?.name || "").trim();
    const phone = (c?.phone || "").trim();
    if (!name && !phone) return;
    setState((s) => {
      const contact = { id: makeContactId(), name, phone };
      const emergencyContacts = [...(s.emergencyContacts || []), contact];
      return { ...s, emergencyContacts, emergencyContact: emergencyContacts[0] };
    });
  }, []);

  /** Remove a contact by id; the new first entry becomes the primary. */
  const removeEmergencyContact = useCallback((id) => {
    setState((s) => {
      const emergencyContacts = (s.emergencyContacts || []).filter((c) => c.id !== id);
      return { ...s, emergencyContacts, emergencyContact: emergencyContacts[0] || null };
    });
  }, []);

  /** Promote a contact to primary (moves it to the front → drives the timeline). */
  const setPrimaryContact = useCallback((id) => {
    setState((s) => {
      const list = s.emergencyContacts || [];
      const idx = list.findIndex((c) => c.id === id);
      if (idx <= 0) return s; // already primary or not found
      const emergencyContacts = [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
      return { ...s, emergencyContacts, emergencyContact: emergencyContacts[0] };
    });
  }, []);

  /**
   * Backward-compatible single-contact setter (kept for the demo seed and any
   * legacy caller): replaces the PRIMARY contact, preserving the rest.
   */
  const setEmergencyContact = useCallback((c) => {
    setState((s) => {
      if (!c) return { ...s, emergencyContacts: [], emergencyContact: null };
      const rest = (s.emergencyContacts || []).slice(1);
      const contact = {
        id: s.emergencyContacts?.[0]?.id || makeContactId(),
        name: (c.name || "").trim(),
        phone: (c.phone || "").trim(),
      };
      const emergencyContacts = [contact, ...rest];
      return { ...s, emergencyContacts, emergencyContact: contact };
    });
  }, []);

  /** Routing writes the chosen hospital so SOS + the hospital view can read it. */
  const setRecommendedHospital = useCallback(
    (recommendedHospital) => patch({ recommendedHospital }),
    [patch]
  );

  /**
   * Optional patient identifiers for the handover card (§ClinicianHandover).
   * Accepts any subset — only the provided keys are written — so the card's
   * editor can save id / age / gender independently. Never invents values.
   */
  const setPatientInfo = useCallback((info) => patch(info), [patch]);

  /**
   * Record the deepest emergency screen the victim reached (§P1). App.jsx calls
   * this on navigation; the resume banner reads it to send the user back to
   * exactly where they were after a restart. We ignore no-op repeats so this
   * never triggers a redundant render / save.
   */
  const setLastRoute = useCallback(
    (lastRoute) =>
      setState((s) => (s.lastRoute === lastRoute ? s : { ...s, lastRoute })),
    []
  );

  /** Dismiss the resume offer for this app session (e.g. user tapped Resume). */
  const dismissResume = useCallback(() => setFreshLaunch(false), []);

  /**
   * Clear the whole emergency and return to a clean slate — for a new victim or
   * a repeat demo. Wipes biteTime, symptomLog, severity, location, snake, etc.
   * and the persisted copy, but KEEPS the chosen language (a UI preference, not
   * part of the emergency). Without this the first bite's stale state would leak
   * into the next use, since everything is mirrored to localStorage.
   */
  const resetEmergency = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — in-memory reset below still applies */
    }
    // Drop the durable session too, so the next emergency starts a clean one.
    clearSession();
    setLastSavedAt(null);
    setSessionStartedAt(null);
    setFreshLaunch(false); // nothing left to resume after an explicit reset
    setState((s) => ({ ...DEFAULT_STATE, language: s.language }));
  }, []);

  /**
   * Load a complete, realistic demo scenario in ONE update — a severe Russell's
   * viper bite near Marpally ~18 min ago, with symptoms, an emergency contact
   * and a recommended hospital already chosen. Lets an on-stage demo jump
   * straight into routing / SOS timeline / handover without waiting on live GPS
   * or permissions. Keeps the chosen language; this is a deliberate seed, so it
   * clears the resume offer rather than triggering it.
   */
  const seedDemo = useCallback(() => {
    const now = Date.now();
    setFreshLaunch(false);
    setState((s) => ({
      ...DEFAULT_STATE,
      language: s.language,
      biteTime: new Date(now - 18 * 60000),
      victimLocation: { lat: 17.27, lng: 77.77 },
      victimLabel: "Marpally, Vikarabad",
      snake: { species: "Russell's Viper", confidence: 0.93, venomous: true },
      severity: "severe",
      symptomLog: [
        {
          t: new Date(now - 6 * 60000),
          answers: {
            swelling: "spreading",
            breathing: "yes",
            vision: "yes",
            bleeding: "no",
            drowsy: "no",
          },
          level: "severe",
        },
      ],
      emergencyContact: { name: "Lakshmi (mother)", phone: "+91 90000 00000" },
      emergencyContacts: [
        { id: "demo-1", name: "Lakshmi (mother)", phone: "+91 90000 00000" },
        { id: "demo-2", name: "Ravi (brother)", phone: "+91 90000 11111" },
      ],
      recommendedHospital: {
        name: "District Hospital Vikarabad",
        tierKey: "dh",
        eta: 27,
        km: 16,
        vials: 30,
        icu: true,
      },
      patientAge: "34",
      patientGender: "female",
    }));
  }, []);

  // A resumable emergency exists when this is a fresh launch AND there is a
  // bite on record. The banner is the only consumer; derive it once here.
  const resumeAvailable = freshLaunch && !!state.biteTime;

  const value = useMemo(
    () => ({
      ...state,
      // Durable-session surface (§P1)
      sessionStartedAt,
      lastSavedAt,
      resumeAvailable,
      setLastRoute,
      dismissResume,
      // Setters
      setLanguage,
      startEmergency,
      setVictimLocation,
      setSnake,
      setSnakeImage,
      setSeverity,
      appendSymptom,
      updateSymptomLogEntry,
      setEmergencyContact,
      addEmergencyContact,
      removeEmergencyContact,
      setPrimaryContact,
      setRecommendedHospital,
      setPatientInfo,
      resetEmergency,
      seedDemo,
    }),
    [
      state,
      sessionStartedAt,
      lastSavedAt,
      resumeAvailable,
      setLastRoute,
      dismissResume,
      setLanguage,
      startEmergency,
      setVictimLocation,
      setSnake,
      setSnakeImage,
      setSeverity,
      appendSymptom,
      updateSymptomLogEntry,
      setEmergencyContact,
      addEmergencyContact,
      removeEmergencyContact,
      setPrimaryContact,
      setRecommendedHospital,
      setPatientInfo,
      resetEmergency,
      seedDemo,
    ]
  );

  return (
    <EmergencyContext.Provider value={value}>
      {children}
    </EmergencyContext.Provider>
  );
}

/**
 * Hook for consuming the emergency state.
 * @returns the §3 contract plus its setters.
 * @throws if used outside <EmergencyProvider>.
 */
export function useEmergency() {
  const ctx = useContext(EmergencyContext);
  if (!ctx) {
    throw new Error("useEmergency must be used within <EmergencyProvider>");
  }
  return ctx;
}

/**
 * Minutes elapsed since the bite, live. Returns null if no bite recorded.
 * Clinicians triage heavily on this number — every screen reads it from here
 * so the value is identical in the tracker, SOS message and hospital view.
 * @param {Date|null} biteTime
 * @param {Date} [now]
 * @returns {number|null}
 */
export function minutesSinceBite(biteTime, now = new Date()) {
  if (!biteTime) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(biteTime).getTime()) / 60000));
}
