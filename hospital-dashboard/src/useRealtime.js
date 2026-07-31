/**
 * useRealtime — WebSocket + always-on polling for the hospital dashboard.
 *
 * Strategy: HTTP polling runs at all times (3s interval) so the case list is
 * never stale. WebSocket is also attempted for instant sub-second push events.
 * WS is an additive layer — not a replacement for polling.
 *
 * Provides:
 *   • cases           — live array of incoming patient cases
 *   • notifications   — unacknowledged emergency alerts
 *   • unreadCount     — badge count for the nav
 *   • acknowledgeNotification(id) — dismiss a notification
 *   • connectionStatus — "ws" | "polling" | "connecting"
 *   • sendHospitalUpdate(caseId, update)
 *   • sendMessage(caseId, message)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as api from "./api.js";

const rawWsBase = (import.meta.env?.VITE_WS_BASE ?? "").replace(/\/+$/, "");
const WS_BASE = rawWsBase
  ? rawWsBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:")
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

const MAX_RECONNECT_DELAY = 10_000;
const POLL_INTERVAL = 1_000;

function getCaseSignature(c) {
  return `${c.id}_${c.status || ""}_${c.eta_min || ""}_${c.updates?.length || 0}_${c.timeline?.length || 0}_${c.last_location?.ts || ""}`;
}

export function useRealtime(hospitalId) {
  const [cases, setCases] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [newCaseAlert, setNewCaseAlert] = useState(null); // latest new-case for toast banner

  const wsRef = useRef(null);
  const wsAttempts = useRef(0);          // reconnect attempt count (for backoff)
  const seenIds = useRef(null);          // Set of already-known case IDs
  const caseSignatures = useRef(new Map()); // Map of caseId -> signature string
  const pollTimer = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // ── Auto-unlock AudioContext on ANY user activity ──────────────────────────
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new Ctx();
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === "suspended") {
            ctx.resume().then(() => setAudioUnlocked(true)).catch(() => {});
          } else if (ctx.state === "running") {
            setAudioUnlocked(true);
          }
        }
      } catch { /* ignore */ }
    };
    const evs = ["click", "keydown", "pointerdown", "touchstart", "mousemove", "mouseover", "scroll", "focus"];
    evs.forEach((e) => window.addEventListener(e, unlockAudio, { passive: true }));
    return () => {
      evs.forEach((e) => window.removeEventListener(e, unlockAudio));
    };
  }, []);

  // ── Notification sound ─────────────────────────────────────────────────
  // ── Notification sound ─────────────────────────────────────────────────
  const audioCtxRef = useRef(null);
  const playAlarm = useCallback(() => {
    try {
      // 1. Primary Engine: Web Audio API Oscillator Siren
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
        const ctx = audioCtxRef.current;
        const doPlay = () => {
          setAudioUnlocked(true);
          const now = ctx.currentTime;
          // Piercing two-tone emergency siren (880Hz / 660Hz) repeated 5 times
          [0, 0.35, 0.70, 1.05, 1.40].forEach((offset) => {
            [[880, 0], [660, 0.14], [880, 0.24], [660, 0.32]].forEach(([freq, t]) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sawtooth";
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0, now + offset + t);
              gain.gain.linearRampToValueAtTime(0.9, now + offset + t + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, now + offset + t + 0.13);
              osc.connect(gain).connect(ctx.destination);
              osc.start(now + offset + t);
              osc.stop(now + offset + t + 0.14);
            });
          });
        };

        if (ctx.state === "suspended") {
          ctx.resume().then(doPlay).catch(doPlay);
        } else {
          doPlay();
        }
      }

      // 2. Secondary Engine: Synthesized HTML5 Audio Buffer
      try {
        const sampleRate = 22050;
        const duration = 1.2;
        const numSamples = Math.floor(sampleRate * duration);
        const buffer = new Int16Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const freq = (Math.floor(t * 6) % 2 === 0) ? 880 : 660;
          buffer[i] = Math.floor(16000 * Math.sin(2 * Math.PI * freq * t));
        }
        const wavHeader = new Uint8Array(44);
        const view = new DataView(wavHeader.buffer);
        view.setUint32(0, 0x46464952, true); // "RIFF"
        view.setUint32(4, 36 + numSamples * 2, true);
        view.setUint32(8, 0x45564157, true); // "WAVE"
        view.setUint32(12, 0x20746d66, true); // "fmt "
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x61746164, true); // "data"
        view.setUint32(40, numSamples * 2, true);

        const blob = new Blob([wavHeader, buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 1.0;
        audio.play().catch(() => {});
      } catch { /* HTML5 fallback quiet fail */ }

    } catch { /* audio unavailable */ }
  }, []);

  // ── Process incoming case list (detect new arrivals & updates) ──────────────────
  const processCases = useCallback((list) => {
    if (!mountedRef.current) return;
    const sorted = sortCases(list);
    setCases(sorted);

    const ids = new Set(sorted.map((c) => c.id));
    if (seenIds.current === null) {
      seenIds.current = ids;
      const sigs = new Map();
      sorted.forEach((c) => sigs.set(c.id, getCaseSignature(c)));
      caseSignatures.current = sigs;
    } else {
      const newCases = sorted.filter((c) => !seenIds.current.has(c.id) && c.live !== false);
      const updatedCases = [];
      sorted.forEach((c) => {
        if (seenIds.current.has(c.id)) {
          const oldSig = caseSignatures.current.get(c.id);
          const newSig = getCaseSignature(c);
          if (oldSig && oldSig !== newSig) {
            updatedCases.push(c);
          }
        }
      });

      seenIds.current = ids;
      const sigs = new Map();
      sorted.forEach((c) => sigs.set(c.id, getCaseSignature(c)));
      caseSignatures.current = sigs;

      if (newCases.length > 0) {
        playAlarm();
        // Show toast banner for the most critical new case
        const topCase = newCases[0];
        setNewCaseAlert({ case: topCase, ts: Date.now() });
        setNotifications((prev) => [
          ...newCases.map((c) => ({
            id: c.id,
            case: c,
            ts: Date.now(),
            acknowledged: false,
          })),
          ...prev,
        ]);
      } else if (updatedCases.length > 0) {
        setNotifications((prev) => [
          ...updatedCases.map((c) => ({
            id: `${c.id}-${Date.now()}`,
            case: c,
            ts: Date.now(),
            acknowledged: false,
          })),
          ...prev,
        ]);
      }
    }
  }, [playAlarm]);

  // ── WebSocket connection ─────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!hospitalId || !mountedRef.current) return;
    try {
      const url = `${WS_BASE}/ws/hospital/${hospitalId}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        wsAttempts.current = 0; // reset backoff on successful connection
        setConnectionStatus("ws");
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "new_case") {
            setCases((prev) => {
              const updated = [msg.data, ...prev.filter((c) => c.id !== msg.data.id)];
              return sortCases(updated);
            });
            // Fire notification
            playAlarm();
            const incoming = msg.data;
            setNewCaseAlert({ case: incoming, ts: Date.now() });
            setNotifications((prev) => [{
              id: msg.data.id,
              case: msg.data,
              ts: Date.now(),
              acknowledged: false,
            }, ...prev]);
            // Update seen IDs
            if (seenIds.current) seenIds.current.add(msg.data.id);
          } else if (msg.type === "case_update") {
            setCases((prev) =>
              sortCases(prev.map((c) => c.id === msg.data.id ? { ...c, ...msg.data } : c))
            );
          } else if (msg.type === "location_update") {
            const d = msg.data;
            setCases((prev) =>
              prev.map((c) =>
                c.id === d.case_id
                  ? { ...c, last_location: { lat: d.lat, lng: d.lng, ts: d.ts } }
                  : c
              )
            );
          } else if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }
        } catch { /* malformed message */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnectionStatus("polling");
        // Exponential backoff reconnect: 1s → 2s → 4s → 8s → 10s (cap)
        wsAttempts.current += 1;
        const delay = Math.min(1000 * 2 ** wsAttempts.current, MAX_RECONNECT_DELAY);
        reconnectTimer.current = setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        // onclose will fire next — handled there
      };
    } catch {
      setConnectionStatus("polling");
      wsAttempts.current += 1;
      const delay = Math.min(1000 * 2 ** wsAttempts.current, MAX_RECONNECT_DELAY);
      reconnectTimer.current = setTimeout(connectWs, delay);
    }
  }, [hospitalId, playAlarm]);

  // ── Polling fallback ─────────────────────────────────────────────────
  const pollCases = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const data = await api.fetchCases();
      processCases(data.cases || []);
    } catch { /* silent — will retry */ }
  }, [processCases]);

  // ── Lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    wsAttempts.current = 0;

    // Always-on polling: fetch immediately, then every POLL_INTERVAL ms.
    // This is the reliable baseline — WS provides a faster push on top.
    pollCases();
    pollTimer.current = setInterval(pollCases, POLL_INTERVAL);

    // Also try WS for sub-second push notifications
    connectWs();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* */ }
      }
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [hospitalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Public API ───────────────────────────────────────────────────────
  const acknowledgeNotification = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, acknowledged: true } : n)
    );
  }, []);

  const acknowledgeAll = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, acknowledged: true })));
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.acknowledged).length,
    [notifications]
  );

  return {
    cases,
    notifications,
    unreadCount,
    acknowledgeNotification,
    acknowledgeAll,
    connectionStatus,
    newCaseAlert,
    dismissNewCaseAlert: useCallback(() => setNewCaseAlert(null), []),
    refreshCases: pollCases,
    playAlarm,
    audioUnlocked,
  };
}

/** Sort cases: severity-first (critical > severe > moderate > mild), then ETA. */
function sortCases(list) {
  const sevOrder = { critical: 0, severe: 1, moderate: 2, mild: 3 };
  return [...list].sort((a, b) => {
    const sa = sevOrder[(a.severity || "").toLowerCase()] ?? 4;
    const sb = sevOrder[(b.severity || "").toLowerCase()] ?? 4;
    if (sa !== sb) return sa - sb;
    return (a.eta_min ?? 999) - (b.eta_min ?? 999);
  });
}
