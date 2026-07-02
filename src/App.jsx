import React, { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { C, SCREEN_BG } from "./theme.js";
import { useEmergency } from "./context/EmergencyContext.jsx";
import Shell from "./components/Shell.jsx";

// Real screens are lazy-loaded and swapped in per build step.
const Home = lazy(() => import("./pages/Home.jsx"));
const FirstAid = lazy(() => import("./pages/FirstAid.jsx"));
const Tracker = lazy(() => import("./pages/Tracker.jsx"));
const Snake = lazy(() => import("./pages/Snake.jsx"));
const SOS = lazy(() => import("./pages/SOS.jsx"));
const Hospital = lazy(() => import("./pages/Hospital.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Learn = lazy(() => import("./pages/Learn.jsx"));
const Stock = lazy(() => import("./pages/Stock.jsx"));
const Routing = lazy(() => import("./pages/Routing.jsx"));

/**
 * Router + layout glue.
 *
 * Two layout groups:
 *   1. <Shell> group — shared chrome (top bar + bottom nav + offline banner)
 *      for every screen in the bite-to-treatment flow plus Help/Learn.
 *   2. /routing — the self-contained hero, rendered full-bleed (no Shell), so
 *      its own frame/header stay untouched per §4.
 *
 * Screens are added per build step. Until a screen exists it routes to
 * <Placeholder>; lazy real components replace it (Suspense fallback ready).
 *
 * Flow order (per the latest spec):
 *   Home → First Aid → (optional) Snake → Tracker → Routing → SOS → Hospital
 */
export default function App() {
  const { language, setLastRoute } = useEmergency();
  const { pathname } = useLocation();

  // Keep <html lang> in sync for correct font shaping / a11y.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Scroll to top on route change (each screen starts fresh).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Record the deepest emergency screen for resume-after-restart (§P1). We skip
  // Home ("/") so returning to the landing never erases where the victim was —
  // the resume banner can still send them back to the real last step.
  useEffect(() => {
    // Skip Home and the non-emergency screens (prevention + staff stock console)
    // so resume-after-restart always returns to the real last emergency step.
    if (pathname !== "/" && pathname !== "/learn" && pathname !== "/stock" && pathname !== "/dashboard") {
      setLastRoute(pathname);
    }
  }, [pathname, setLastRoute]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Shared-chrome screens */}
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/first-aid" element={<FirstAid />} />
          <Route path="/snake" element={<Snake />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/sos" element={<SOS />} />
          <Route path="/hospital" element={<Hospital />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/stock" element={<Stock />} />
        </Route>

        {/* Hero — full-bleed, self-contained, reads/writes EmergencyContext */}
        <Route path="/routing" element={<Routing />} />

        {/* Unknown paths (and the legacy /help alias) redirect Home — never a
            dead-end spinner. Help now lives in the Learn screen (see BottomNav). */}
        <Route path="/help" element={<Navigate to="/learn" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/** Full-frame loading fallback for lazy route chunks. */
function RouteFallback() {
  return (
    <div
      style={{ background: SCREEN_BG, minHeight: "100vh" }}
      className="w-full flex items-center justify-center"
    >
      <span className="ap-spin inline-flex" style={{ color: C.tealLight }}>
        <Loader2 size={32} />
      </span>
    </div>
  );
}
