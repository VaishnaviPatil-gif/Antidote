import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, ChevronRight, RotateCcw, Clock } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency, minutesSinceBite } from "../context/EmergencyContext.jsx";

/**
 * Resume-after-restart banner (§P1).
 *
 * Rendered on Home. Appears only on a *fresh app launch* (see `resumeAvailable`
 * in EmergencyContext) when a bite is already on record — i.e. the victim has
 * an unfinished emergency that was auto-saved durably to IndexedDB. It restores
 * them to the deepest screen they reached (`lastRoute`), or lets them start
 * over. On in-app navigation back to Home it stays hidden, so it never nags.
 *
 * Reuses the shared theme, i18n and the live `minutesSinceBite` helper so the
 * "since bite" figure matches every other screen exactly.
 */
export default function ResumeBanner() {
  const navigate = useNavigate();
  const {
    language,
    biteTime,
    lastRoute,
    resumeAvailable,
    dismissResume,
    resetEmergency,
  } = useEmergency();
  const t = tFor(language);

  // Live-ish elapsed time, computed once on render — the banner is transient.
  const [mins] = useState(() => minutesSinceBite(biteTime));

  if (!resumeAvailable || !biteTime) return null;

  // Where "Resume" goes: the saved last step, falling back to first aid (the
  // first emergency screen) if none was recorded.
  const target = lastRoute && lastRoute !== "/" ? lastRoute : "/first-aid";
  const stepLabel = t.resume.steps[target] || t.resume.steps["/first-aid"];

  const handleResume = () => {
    dismissResume();
    navigate(target);
  };

  const handleDiscard = () => {
    dismissResume();
    resetEmergency();
  };

  return (
    <section
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: "#F2D9BD", background: C.amberPale }}
      role="status"
    >
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        <div className="rounded-lg p-2 shrink-0" style={{ background: "#FBE6CC" }}>
          <History size={18} style={{ color: C.amber }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: C.amber }}>
            {t.resume.title}
          </div>
          <div className="text-xs leading-snug" style={{ color: C.dark }}>
            {t.resume.body}
          </div>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs" style={{ color: C.muted }}>
            {mins != null && (
              <span className="flex items-center gap-1">
                <Clock size={12} style={{ color: C.amber }} />
                <span className="tabular-nums font-semibold" style={{ color: C.dark }}>
                  {mins}
                </span>
                {t.common.min} {t.resume.sinceBite}
              </span>
            )}
            <span>
              {t.resume.lastStep}:{" "}
              <span className="font-semibold" style={{ color: C.dark }}>
                {stepLabel}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-3 pt-1">
        <button
          onClick={handleResume}
          className="flex-1 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 active:scale-[.98] transition-transform"
          style={{ background: C.orange, height: 46, fontSize: 15 }}
        >
          {t.resume.resumeBtn}
          <ChevronRight size={17} />
        </button>
        <button
          onClick={handleDiscard}
          className="rounded-xl font-semibold flex items-center justify-center gap-1.5 px-4 active:scale-[.98] transition-transform bg-white border"
          style={{ borderColor: "#E3D2BC", color: C.muted, height: 46, fontSize: 14 }}
        >
          <RotateCcw size={15} />
          {t.resume.discardBtn}
        </button>
      </div>
    </section>
  );
}
