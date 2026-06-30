import { useState, useEffect, useRef, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";

/**
 * useGeolocation — live device position for emergency navigation (Priority 2).
 *
 * Wraps the Capacitor Geolocation plugin (which also backs the browser during
 * dev via its web implementation). Behaviour, per spec:
 *   • Requests runtime location permission on start.
 *   • Polls `getCurrentPosition` on a fixed cadence (default 5s) for a
 *     deterministic "updates every 5 seconds" stream — simpler and more
 *     predictable than watchPosition's movement-driven callbacks.
 *   • Stops cleanly when navigation ends (`enabled` flips to false / unmount).
 *   • Background-aware: pauses polling when the app is hidden, keeps the last
 *     known fix, and resumes immediately on return.
 *   • Error handling: permission denial is surfaced distinctly (so the UI can
 *     show enable-instructions); transient GPS failures auto-retry.
 *
 * Every async path is guarded so a late resolution after stop/unmount can never
 * setState — matching the app's "persistence never throws into React" stance.
 *
 * @param {{enabled?:boolean, intervalMs?:number}} opts
 * @returns {{
 *   position: object|null, lastKnown: object|null,
 *   status: "idle"|"requesting"|"tracking"|"denied"|"unavailable",
 *   error: string|null, retry: () => void
 * }}
 */
const DEFAULT_INTERVAL = 5000;
const RETRY_MS = 3000; // faster than the normal cadence while (re)acquiring a fix
const GET_OPTS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 };

/** Normalise a Geolocation position into the flat shape the app uses. */
function normalize(pos) {
  const c = (pos && pos.coords) || {};
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy ?? null,
    speed: c.speed ?? null, // metres/second, when the platform provides it
    heading: c.heading ?? null,
    timestamp: pos && pos.timestamp ? pos.timestamp : Date.now(),
  };
}

/** Map a raw error to "denied" (permission) vs "unavailable" (transient). */
function classify(err) {
  if (err && err.code === 1) return "denied";
  const msg = (err && (err.message || String(err.code) || "")).toString().toLowerCase();
  if (msg.includes("denied") || msg.includes("permission")) return "denied";
  return "unavailable";
}

export function useGeolocation({ enabled = false, intervalMs = DEFAULT_INTERVAL } = {}) {
  const [position, setPosition] = useState(null);
  const [lastKnown, setLastKnown] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const activeRef = useRef(false); // true between start() and stop()
  const timerRef = useRef(null);
  const permaskedRef = useRef(false); // request permission only once per run

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(
    (delay, tick) => {
      clearTimer();
      timerRef.current = setTimeout(tick, delay);
    },
    [clearTimer]
  );

  // One position read + reschedule. Defined via ref so it can re-reference
  // itself across renders without re-creating the whole polling loop.
  const tickRef = useRef(() => {});
  useEffect(() => {
    tickRef.current = async () => {
      if (!activeRef.current) return;
      try {
        const pos = await Geolocation.getCurrentPosition(GET_OPTS);
        if (!activeRef.current) return;
        const norm = normalize(pos);
        setPosition(norm);
        setLastKnown(norm);
        setStatus("tracking");
        setError(null);
        scheduleNext(intervalMs, () => tickRef.current());
      } catch (err) {
        if (!activeRef.current) return;
        const kind = classify(err);
        setStatus(kind);
        setError(err && err.message ? err.message : "Location error");
        // Permission denial is terminal until the user retries; transient GPS
        // failures auto-retry on a shorter interval (we keep lastKnown intact).
        if (kind !== "denied") {
          scheduleNext(RETRY_MS, () => tickRef.current());
        }
      }
    };
  }, [intervalMs, scheduleNext]);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setStatus("requesting");
    setError(null);

    // Ask for runtime permission once. The web/older platforms may not
    // implement the permission API — in that case fall through to
    // getCurrentPosition, which prompts and reports denial via its error.
    if (!permaskedRef.current) {
      permaskedRef.current = true;
      try {
        const res = await Geolocation.requestPermissions();
        if (!activeRef.current) return;
        if (res && res.location === "denied") {
          setStatus("denied");
          setError("Location permission denied");
          return;
        }
      } catch {
        /* permission API unavailable — let getCurrentPosition drive the prompt */
      }
    }
    if (!activeRef.current) return;
    tickRef.current();
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    setStatus("idle");
  }, [clearTimer]);

  /** Manual retry after a denial / failure — re-asks permission and resumes. */
  const retry = useCallback(() => {
    permaskedRef.current = false;
    stop();
    // Restart on the next tick so `stop`'s state settles first.
    setTimeout(() => start(), 0);
  }, [start, stop]);

  // Drive start/stop from the `enabled` flag.
  useEffect(() => {
    if (enabled) start();
    else stop();
    return () => stop();
  }, [enabled, start, stop]);

  // Background-aware: pause the poll when hidden (preserving lastKnown), resume
  // with an immediate fix when the app returns to the foreground.
  useEffect(() => {
    const onVisibility = () => {
      if (!activeRef.current) return;
      if (document.visibilityState === "hidden") {
        clearTimer();
      } else {
        tickRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearTimer]);

  return { position, lastKnown, status, error, retry };
}
