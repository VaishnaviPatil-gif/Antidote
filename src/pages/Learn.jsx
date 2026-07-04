import React, { useState } from "react";
import {
  ShieldQuestion, CalendarDays, Moon, MapPin, Info, Flashlight,
} from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";
import { DISTRICTS, computeRisk } from "../lib/risk.js";
import BackButton from "../components/BackButton.jsx";

/**
 * Learn & prevent — the high-risk indicator (§2.6).
 *
 * PREVENTION, not emergency: it lives behind Home → Learn and is never in the
 * bottom nav or the bite-to-treatment path. The band comes from the transparent
 * rules in lib/risk.js (season + time of day + seeded district density) — no AI,
 * no prediction. Every contributing factor is shown so the band is explainable.
 */

/** Band → brand tone + soft tint, reused by the band card and factor chips. */
const BAND_TONE = { low: C.good, medium: C.amber, high: C.danger };
const BAND_PALE = { low: C.goodPale, medium: C.amberPale, high: C.dangerPale };

/** Factor key → icon + i18n label key. */
const FACTOR_META = {
  season: { icon: CalendarDays, labelKey: "factorMonth" },
  time: { icon: Moon, labelKey: "factorTime" },
  density: { icon: MapPin, labelKey: "factorDensity" },
};

export default function Learn() {
  const { language } = useEmergency();
  const t = tFor(language);

  const [districtKey, setDistrictKey] = useState(DISTRICTS[0].key);
  const district = DISTRICTS.find((d) => d.key === districtKey) || DISTRICTS[0];

  // Current month + hour drive the band. Recomputed on render — it's a static
  // indicator, no timer needed.
  const now = new Date();
  const risk = computeRisk({
    month: now.getMonth(),
    hour: now.getHours(),
    districtBase: district.base,
  });
  const tone = BAND_TONE[risk.band];

  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
      {/* ── Title (with consistent back control) ───────────────── */}
      <div className="flex items-start gap-2">
        <BackButton />
        <ShieldQuestion size={20} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <div>
          <h1 className="text-lg font-extrabold leading-tight" style={{ color: C.dark }}>
            {t.risk.title}
          </h1>
          <p className="text-xs leading-snug" style={{ color: C.muted }}>
            {t.risk.subtitle}
          </p>
        </div>
      </div>

      {/* ── District selector (transparent input) ──────────────── */}
      <div className="flex flex-wrap gap-2">
        {DISTRICTS.map((d) => {
          const active = d.key === districtKey;
          return (
            <button
              key={d.key}
              onClick={() => setDistrictKey(d.key)}
              aria-pressed={active}
              className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold active:scale-[.98] transition-transform"
              style={{
                borderColor: active ? C.teal : "#D7E3E2",
                borderWidth: active ? 2 : 1,
                background: active ? C.tealPale : "#fff",
                color: active ? C.tealDark : C.muted,
              }}
            >
              <MapPin size={13} />
              {d.label}
            </button>
          );
        })}
      </div>

      {/* ── Band card ──────────────────────────────────────────── */}
      <div
        className="rounded-2xl border px-4 py-4"
        style={{ borderColor: tone + "55", background: BAND_PALE[risk.band] }}
      >
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>
          {t.risk.bandLabel}
        </div>
        <div className="flex items-end gap-2 mt-1">
          <span className="text-3xl font-extrabold leading-none" style={{ color: tone }}>
            {t.risk.band[risk.band]}
          </span>
          <span className="text-xs font-semibold mb-1" style={{ color: C.muted }}>
            {district.label}
          </span>
        </div>
        <div className="flex items-start gap-2 mt-2">
          <Flashlight size={16} style={{ color: tone }} className="shrink-0 mt-0.5" />
          <p className="text-sm leading-snug" style={{ color: C.dark }}>
            {t.risk.guidance[risk.band]}
          </p>
        </div>
      </div>

      {/* ── Why (factor breakdown — transparent) ───────────────── */}
      <section>
        <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
          {t.risk.factors}
        </div>
        <ul className="flex flex-col gap-2">
          {risk.factors.map((f) => {
            const meta = FACTOR_META[f.key];
            const Icon = meta.icon;
            const fTone = BAND_TONE[f.level];
            return (
              <li
                key={f.key}
                className="rounded-xl bg-white border px-3 py-2.5 flex items-center gap-3"
                style={{ borderColor: "#E1EAE9" }}
              >
                <div className="rounded-lg p-2 shrink-0" style={{ background: BAND_PALE[f.level] }}>
                  <Icon size={16} style={{ color: fTone }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: C.dark }}>
                    {t.risk[meta.labelKey]}
                  </div>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0"
                  style={{ background: BAND_PALE[f.level], color: fTone }}
                >
                  {t.risk.band[f.level]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: C.tealPale }}>
        <Info size={14} style={{ color: C.teal }} className="shrink-0 mt-0.5" />
        <span className="text-xs leading-snug" style={{ color: C.tealDark }}>
          {t.risk.disclaimer}
        </span>
      </div>
    </div>
  );
}
