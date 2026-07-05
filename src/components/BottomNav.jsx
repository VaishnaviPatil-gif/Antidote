import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Siren, Activity, Send, LifeBuoy } from "lucide-react";
import { C } from "../theme.js";
import { tFor } from "../i18n.js";
import { useEmergency } from "../context/EmergencyContext.jsx";

/**
 * Fixed bottom navigation: Emergency · Tracker · SOS · Help.
 *
 * The high-risk indicator is deliberately NOT here — it's prevention, reached
 * via Home → Learn, never in the victim's bite-to-treatment path (§2.6).
 *
 * Each tab is a ≥48px tap target with an aria-label and a visible active
 * state. "Emergency" stays active across the whole bite-to-treatment flow
 * (home, first aid, snake, hospital) so the victim always knows where they are.
 */
const ITEMS = [
  { key: "emergency", to: "/", icon: Siren, group: ["/", "/first-aid", "/snake", "/hospital"] },
  { key: "tracker", to: "/tracker", icon: Activity, group: ["/tracker"] },
  { key: "sos", to: "/sos", icon: Send, group: ["/sos"] },
  { key: "help", to: "/learn", icon: LifeBuoy, group: ["/help", "/learn"] },
];

export default function BottomNav() {
  const { language } = useEmergency();
  const t = tFor(language);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-frame z-40 safe-bottom"
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid #E1EAE9",
        boxShadow: "0 -4px 20px rgba(10,79,79,.06)",
      }}
    >
      <ul className="flex items-stretch">
        {ITEMS.map(({ key, to, icon: Icon, group }) => {
          const active = group.includes(pathname);
          return (
            <li key={key} className="flex-1">
              <button
                onClick={() => navigate(to)}
                aria-label={t.nav[key]}
                aria-current={active ? "page" : undefined}
                className="w-full flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                style={{ minHeight: 58, padding: "8px 4px" }}
              >
                <span
                  className="flex items-center justify-center rounded-full transition-all duration-200"
                  style={{
                    width: 46,
                    height: 26,
                    background: active ? C.tealPale : "transparent",
                  }}
                >
                  <Icon
                    size={21}
                    strokeWidth={active ? 2.6 : 2}
                    style={{ color: active ? C.teal : C.muted }}
                    fill={active && key === "emergency" ? "rgba(13,110,110,.14)" : "none"}
                  />
                </span>
                <span
                  className="text-[11px] font-bold leading-none"
                  style={{ color: active ? C.teal : C.muted }}
                >
                  {t.nav[key]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
