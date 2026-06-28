import React, { Suspense, lazy, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { C, SCREEN_BG } from "./theme.js";
import { useEmergency } from "./context/EmergencyContext.jsx";
import Shell from "./components/Shell.jsx";
import Placeholder from "./components/Placeholder.jsx";

// Real screens are lazy-loaded and swapped in per build step.
const Home = lazy(() => import("./pages/Home.jsx"));
const FirstAid = lazy(() => import("./pages/FirstAid.jsx"));
const Tracker = lazy(() => import("./pages/Tracker.jsx"));
const Snake = lazy(() => import("./pages/Snake.jsx"));
const SOS = lazy(() => import("./pages/SOS.jsx"));
const Hospital = lazy(() => import("./pages/Hospital.jsx"));
const Learn = lazy(() => import("./pages/Learn.jsx"));
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
  const { language } = useEmergency();
  const { pathname } = useLocation();

  // Keep <html lang> in sync for correct font shaping / a11y.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Scroll to top on route change (each screen starts fresh).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
          <Route path="/learn" element={<Learn />} />
          <Route path="/help" element={<Placeholder screen="help" />} />
        </Route>

        {/* Hero — full-bleed, self-contained, reads/writes EmergencyContext */}
        <Route path="/routing" element={<Routing />} />

        {/* Unknown paths fall back to Home */}
        <Route path="*" element={<Shell />}>
          <Route path="*" element={<Placeholder screen="home" />} />
        </Route>
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
