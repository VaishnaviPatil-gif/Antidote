import React from "react";
import { Loader2 } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

/**
 * Temporary screen for routes whose real component is built in a later step.
 * On-brand and intentional-looking (never a broken blank) so the shell is
 * demoable immediately. Each build step swaps its route off this component.
 *
 * @param {{ screen: string }} props - i18n section key, used only for a label.
 */
export default function Placeholder({ screen }) {
  const { language } = useEmergency();
  const t = tFor(language);
  const label = t[screen]?.title || screen;

  return (
    <div className="px-4 py-10 flex flex-col items-center justify-center text-center gap-3">
      <span className="ap-spin inline-flex" style={{ color: C.tealLight }}>
        <Loader2 size={28} />
      </span>
      <div className="text-sm font-semibold" style={{ color: C.dark }}>
        {label}
      </div>
      <div className="text-xs" style={{ color: C.muted }}>
        {t.common.loading}
      </div>
    </div>
  );
}
