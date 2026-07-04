import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { C } from "../theme.js";

/**
 * Shared back control used on every screen except Home.
 *
 * Uses navigate(-1) so it pops the router history and returns the user to
 * wherever they came from. EmergencyContext lives ABOVE the router (in
 * <EmergencyProvider>), so navigating back never unmounts it — every entered
 * value (bite time, symptoms, contacts, recommended hospital) is preserved.
 *
 * Visually identical to the header back button already used on Stock / Analytics
 * / Resources, so all screens share one design. `tone="onTeal"` renders the
 * white-on-teal variant for the routing hero's coloured header.
 */
export default function BackButton({ tone = "teal", className = "" }) {
  const navigate = useNavigate();
  const onTeal = tone === "onTeal";
  return (
    <button
      onClick={() => navigate(-1)}
      aria-label="Back"
      className={`inline-flex items-center gap-1 rounded-lg pl-1.5 pr-2.5 py-1.5 shrink-0 text-sm font-bold active:scale-95 transition-transform ${className}`}
      style={{ background: onTeal ? "rgba(255,255,255,.16)" : C.tealPale, color: onTeal ? "#fff" : C.teal }}
    >
      <ChevronLeft size={18} />
      Back
    </button>
  );
}
