import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Siren, Crosshair, CheckCircle2, Loader2, MapPin,
  ChevronRight, ShieldQuestion, Pencil, Navigation2, Play, Boxes, Activity, BarChart3,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import ResumeBanner from "../components/ResumeBanner.jsx";

/**
 * Home / Emergency landing (§2.2).
 *
 * Calm, single-dominant-action screen. The big "I've been bitten" button
 * stamps biteTime, ensures a victimLocation, and routes into FIRST AID (care
 * before species ID, per the latest flow order).
 *
 * Location is captured here with three honest states — locating, captured
 * (GPS), and permission-denied → manual entry — and written to context as
 * soon as it resolves so every later screen (and routing) reads it. If the
 * victim taps the hero before location resolves, we fall back to the seeded
 * Marpally scenario so the demo flow never breaks.
 */

/** Seeded villages across Vikarabad district (coords from the routing data),
 *  used for the offline-friendly manual fallback. First entry is the default. */
const SEED_VILLAGES = [
  { label: "Marpally, Vikarabad", lat: 17.27, lng: 77.77 },
  { label: "Doultabad", lat: 17.305, lng: 77.73 },
  { label: "Tandur", lat: 17.245, lng: 77.575 },
  { label: "Parigi", lat: 17.13, lng: 77.87 },
];
const DEFAULT_LOCATION = SEED_VILLAGES[0];

/**
 * Demo-only switch. When true, tapping the hero with no resolved location
 * silently falls back to the seeded Marpally scenario so an on-stage demo
 * never dead-ends. In production (false) real GPS or an explicit manual
 * choice is required — we never fabricate a victim location.
 */
const DEMO_MODE = true;

export default function Home() {
  const navigate = useNavigate();
  const { startEmergency, setVictimLocation, seedDemo } = useEmergency();
  const { language } = useEmergency();
  const t = tFor(language);

  /** One-tap demo: load a full realistic scenario and jump into routing. */
  const runDemo = useCallback(() => {
    seedDemo();
    navigate("/routing");
  }, [seedDemo, navigate]);

  // location state machine: "locating" | "ready" | "denied"
  const [status, setStatus] = useState("locating");
  const [location, setLocation] = useState(null); // { lat, lng, label, source }
  const [manualOpen, setManualOpen] = useState(false);
  const [villageText, setVillageText] = useState("");

  // Try GPS once on mount. Success writes location to context immediately;
  // denial/absence drops to the manual fallback.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("denied");
      setManualOpen(true);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: null, // GPS gives no place name; routing/SOS show coords
          source: "gps",
        };
        setLocation(loc);
        setVictimLocation({ lat: loc.lat, lng: loc.lng }, loc.label);
        setStatus("ready");
      },
      () => {
        if (cancelled) return;
        setStatus("denied");
        setManualOpen(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
    return () => {
      cancelled = true;
    };
  }, [setVictimLocation]);

  /** Commit a manually chosen / typed location into state + context. */
  const chooseLocation = useCallback(
    (loc) => {
      setLocation(loc);
      setVictimLocation({ lat: loc.lat, lng: loc.lng }, loc.label);
      setStatus("ready");
      setManualOpen(false);
    },
    [setVictimLocation]
  );

  const useTypedVillage = useCallback(() => {
    const label = villageText.trim() || DEFAULT_LOCATION.label;
    // Typed names map to the seeded district scenario (offline demo data).
    chooseLocation({ ...DEFAULT_LOCATION, label, source: "manual" });
  }, [villageText, chooseLocation]);

  /** The hero action: stamp the bite, guarantee a location, go to first aid.
   *  Real GPS / manual entry is always preferred; the seeded fallback only
   *  applies in DEMO_MODE. In production with no location yet, we surface the
   *  manual entry rather than fabricating coordinates. */
  const handleBitten = useCallback(() => {
    let loc = location;
    if (!loc && DEMO_MODE) loc = { ...DEFAULT_LOCATION, source: "demo" };
    if (!loc) {
      setStatus("denied");
      setManualOpen(true);
      return;
    }
    startEmergency({ lat: loc.lat, lng: loc.lng }, loc.label);
    navigate("/first-aid");
  }, [location, startEmergency, navigate]);

  return (
    <div className="px-4 pt-5 pb-6 flex flex-col gap-4">
      {/* Calm pulse for the hero — neutralised under prefers-reduced-motion. */}
      <style>{`
        @keyframes calmPulse {
          0% { box-shadow: 0 0 0 0 rgba(13,110,110,.30); }
          70% { box-shadow: 0 0 0 20px rgba(13,110,110,0); }
          100% { box-shadow: 0 0 0 0 rgba(13,110,110,0); }
        }
        .ap-hero { animation: calmPulse 2.6s ease-out infinite; }
      `}</style>

      {/* ── Resume an in-progress emergency after an app restart (§P1) ── */}
      <ResumeBanner />

      {/* ── Hero action ─────────────────────────────────────────── */}
      <button
        onClick={handleBitten}
        className="ap-hero w-full rounded-2xl text-white font-extrabold flex flex-col items-center justify-center gap-2 active:scale-[.99] transition-transform"
        style={{ background: C.teal, minHeight: 168, padding: "20px" }}
      >
        <span
          className="flex items-center justify-center rounded-2xl"
          style={{ background: "rgba(255,255,255,.16)", width: 56, height: 56 }}
        >
          <Siren size={30} strokeWidth={2.4} />
        </span>
        <span style={{ fontSize: 23, lineHeight: 1.15 }} className="text-center">
          {t.home.bittenBtn}
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: "#CFEAE8" }}>
          {t.home.start} <ChevronRight size={16} />
        </span>
      </button>

      {/* ── Reassurance (calm + prominent) ──────────────────────── */}
      <div
        className="rounded-2xl px-4 py-3 text-center"
        style={{ background: C.tealPale }}
      >
        <p className="text-sm font-semibold leading-snug" style={{ color: C.tealDark }}>
          {t.home.reassure}
        </p>
      </div>

      {/* ── Location capture (locating / ready / denied + manual) ── */}
      <section
        className="rounded-2xl bg-white border"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <div
            className="rounded-lg p-1.5 shrink-0"
            style={{
              background:
                status === "ready" ? C.goodPale : status === "denied" ? C.amberPale : C.tealPale,
            }}
          >
            {status === "locating" && (
              <span className="ap-spin inline-flex" style={{ color: C.teal }}>
                <Loader2 size={18} />
              </span>
            )}
            {status === "ready" && <CheckCircle2 size={18} style={{ color: C.good }} />}
            {status === "denied" && <Crosshair size={18} style={{ color: C.amber }} />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs" style={{ color: C.muted }}>
              {t.victim}
            </div>
            <div className="text-sm font-semibold truncate" style={{ color: C.dark }}>
              {status === "locating" && t.home.locating}
              {status === "ready" &&
                (location?.label
                  ? location.label
                  : location
                  ? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`
                  : t.home.locOk)}
              {status === "denied" && t.home.locDenied}
            </div>
          </div>

          {/* Allow re-opening manual entry from any non-loading state. */}
          {status !== "locating" && !manualOpen && (
            <button
              onClick={() => setManualOpen(true)}
              aria-label={t.home.locManual}
              className="flex items-center gap-1 text-xs font-semibold rounded-lg px-2 py-1.5 shrink-0"
              style={{ color: C.teal, background: C.tealPale }}
            >
              <Pencil size={13} />
              {t.home.locManual.split(" ")[0]}
            </button>
          )}
        </div>

        {/* Manual entry */}
        {manualOpen && (
          <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "#EEF4F3" }}>
            <div className="text-xs font-semibold mt-3 mb-2" style={{ color: C.muted }}>
              {t.home.locManual}
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {SEED_VILLAGES.map((v) => (
                <button
                  key={v.label}
                  onClick={() => chooseLocation({ ...v, source: "manual" })}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold active:scale-[.98] transition-transform"
                  style={{ borderColor: "#D7E3E2", color: C.tealDark, background: "#fff" }}
                >
                  <MapPin size={13} style={{ color: C.tealLight }} />
                  {v.label.split(",")[0]}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <label htmlFor="village" className="sr-only">
                {t.home.villagePlaceholder}
              </label>
              <input
                id="village"
                type="text"
                inputMode="text"
                value={villageText}
                onChange={(e) => setVillageText(e.target.value)}
                placeholder={t.home.villagePlaceholder}
                className="flex-1 min-w-0 rounded-xl border px-3 text-base"
                style={{ borderColor: "#D7E3E2", height: 48, color: C.dark }}
              />
              <button
                onClick={useTypedVillage}
                className="rounded-xl text-white font-semibold px-4 shrink-0 active:scale-[.98] transition-transform"
                style={{ background: C.teal, height: 48, fontSize: 14 }}
              >
                {t.home.useLoc}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Quiet Learn entry (prevention — never blocks the flow) ── */}
      <button
        onClick={() => navigate("/learn")}
        className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition-transform"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
          <ShieldQuestion size={18} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            {t.home.learn}
          </div>
          <div className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.home.learnHint}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: C.muted }} className="shrink-0" />
      </button>

      {/* ── Hospital-staff entry — update the live antivenom/bed feed ── */}
      <button
        onClick={() => navigate("/stock")}
        className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition-transform"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
          <Boxes size={18} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            {t.home.staff}
          </div>
          <div className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.home.staffHint}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: C.muted }} className="shrink-0" />
      </button>

      {/* ── Hospital Dashboard entry — view all incoming patient cases ── */}
      <button
        onClick={() => navigate("/dashboard")}
        className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition-transform"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
          <Activity size={18} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            {t.dashboard.title}
          </div>
          <div className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.dashboard.subtitle}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: C.muted }} className="shrink-0" />
      </button>

      {/* ── Snakebite Analytics entry — view regional stats & trends ── */}
      <button
        onClick={() => navigate("/analytics")}
        className="rounded-2xl bg-white border px-4 py-3 flex items-center gap-3 text-left active:scale-[.99] transition-transform"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-lg p-2 shrink-0" style={{ background: C.tealPale }}>
          <BarChart3 size={18} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: C.dark }}>
            {t.analytics.title}
          </div>
          <div className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.analytics.subtitle}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: C.muted }} className="shrink-0" />
      </button>

      {/* ── Demo shortcut (demo builds only) — seed a full scenario & jump ── */}
      {DEMO_MODE && (
        <button
          onClick={runDemo}
          className="rounded-xl border border-dashed flex items-center justify-center gap-1.5 py-2.5 active:scale-[.99] transition-transform"
          style={{ borderColor: "#C5DBD9", color: C.muted, background: "transparent" }}
        >
          <Play size={13} style={{ color: C.tealLight }} />
          <span className="text-xs font-semibold">Load demo scenario</span>
        </button>
      )}

      {/* Subtle footnote tying Home to the routing scenario without alarm. */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-xs" style={{ color: C.muted }}>
        <Navigation2 size={12} style={{ color: C.tealLight }} />
        <span>{t.tag}</span>
      </div>
    </div>
  );
}
