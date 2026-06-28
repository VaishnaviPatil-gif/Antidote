import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, Check, X, Camera, ChevronRight, SkipForward, HeartPulse,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

/**
 * First aid (§2.4) — shown immediately, while the victim moves toward care.
 *
 * Medically-correct DO / DON'T lists come verbatim from the shared i18n
 * tables (the spec copy — never invented here). A live "time since bite"
 * timer reads biteTime from EmergencyContext (the single source of truth;
 * no duplicated state). The snake photo is strictly optional: the primary CTA
 * continues to it, the secondary CTA skips straight to the severity tracker.
 */
export default function FirstAid() {
  const navigate = useNavigate();
  const { biteTime, language } = useEmergency();
  const t = tFor(language);

  // Live clock — the only local state here, and it is purely presentational.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = biteTime
    ? Math.max(0, Math.floor((now.getTime() - new Date(biteTime).getTime()) / 1000))
    : null;
  const mm = elapsedSec != null ? Math.floor(elapsedSec / 60) : null;
  const ss = elapsedSec != null ? elapsedSec % 60 : null;
  const clock =
    elapsedSec != null ? `${mm}:${String(ss).padStart(2, "0")}` : "—:—";

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* ── Live time since bite ───────────────────────────────── */}
      <div
        className="rounded-2xl bg-white border flex items-center gap-3 px-4 py-3"
        style={{ borderColor: "#E1EAE9" }}
      >
        <div className="rounded-xl p-2 shrink-0" style={{ background: C.tealPale }}>
          <Clock size={20} style={{ color: C.teal }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs" style={{ color: C.muted }}>
            {t.firstAid.timeSince}
          </div>
          {elapsedSec != null ? (
            <div
              className="text-2xl font-extrabold tabular-nums leading-tight"
              style={{ color: C.dark }}
              aria-live="off"
            >
              {clock}
              <span className="text-sm font-semibold ml-1.5" style={{ color: C.muted }}>
                {t.common.min}
              </span>
            </div>
          ) : (
            <div className="text-sm font-semibold" style={{ color: C.amber }}>
              {t.firstAid.notStarted}
            </div>
          )}
        </div>
        <HeartPulse size={20} style={{ color: C.tealLight }} className="shrink-0" />
      </div>

      {/* ── Title ──────────────────────────────────────────────── */}
      <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
        {t.firstAid.title}
      </h1>

      {/* ── DO ─────────────────────────────────────────────────── */}
      <section
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "#CFE7DC" }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-white"
          style={{ background: C.good }}
        >
          <Check size={18} strokeWidth={3} />
          <span className="text-sm font-bold uppercase tracking-wide">
            {t.firstAid.doTitle}
          </span>
        </div>
        <ul className="bg-white px-4 py-3 space-y-2.5">
          {t.firstAid.doItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="rounded-full p-0.5 shrink-0 mt-0.5"
                style={{ background: C.goodPale }}
              >
                <Check size={14} strokeWidth={3} style={{ color: C.good }} />
              </span>
              <span className="text-sm leading-snug" style={{ color: C.dark }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── DON'T (these kill — shown clearly) ─────────────────── */}
      <section
        className="rounded-2xl overflow-hidden border"
        style={{ borderColor: "#F0CFC9" }}
      >
        <div
          className="px-4 py-2 flex items-center gap-2 text-white"
          style={{ background: C.danger }}
        >
          <X size={18} strokeWidth={3} />
          <span className="text-sm font-bold uppercase tracking-wide">
            {t.firstAid.dontTitle}
          </span>
        </div>
        <ul className="px-4 py-3 space-y-2.5" style={{ background: C.dangerPale }}>
          {t.firstAid.dontItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="rounded-full p-0.5 shrink-0 mt-0.5"
                style={{ background: "#F6D9D4" }}
              >
                <X size={14} strokeWidth={3} style={{ color: C.danger }} />
              </span>
              <span className="text-sm font-semibold leading-snug" style={{ color: C.dark }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* English-marker note for the longer guidance. */}
      <p className="text-xs leading-snug" style={{ color: C.muted }}>
        {t.firstAid.note}
      </p>

      {/* ── CTAs — photo stays optional, never blocks the flow ──── */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={() => navigate("/snake")}
          className="w-full rounded-xl text-white font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ background: C.teal, height: 54, fontSize: 16 }}
        >
          <Camera size={18} />
          {t.firstAid.continueSnake}
          <ChevronRight size={18} />
        </button>

        <button
          onClick={() => navigate("/tracker")}
          className="w-full rounded-xl border font-semibold flex items-center justify-center gap-2 active:scale-[.98] transition-transform"
          style={{ borderColor: C.teal, color: C.teal, height: 50, fontSize: 15, background: "#fff" }}
        >
          <SkipForward size={16} />
          {t.firstAid.skipPhoto}
        </button>
      </div>
    </div>
  );
}
