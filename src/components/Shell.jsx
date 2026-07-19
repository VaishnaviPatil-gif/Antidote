import React from "react";
import { Outlet } from "react-router-dom";
import { SCREEN_BG, FRAME_BG, FRAME_SHADOW } from "../theme.js";
import TopBar from "./TopBar.jsx";
import BottomNav from "./BottomNav.jsx";
import OfflineBanner from "./OfflineBanner.jsx";
import VoiceFab from "./VoiceFab.jsx";

/**
 * App shell for every screen EXCEPT the routing hero.
 *
 * Reproduces the routing file's frame exactly: an ambient backdrop with a
 * centred 430px card, full-height, columnar. Provides the shared chrome
 * (offline banner → top bar → scrollable content → fixed bottom nav) so each
 * screen only renders its own body via <Outlet>.
 *
 * The routing screen is intentionally rendered full-bleed (outside this Shell)
 * because it is self-contained and is the app's hero (§4).
 */
export default function Shell() {
  return (
    <div
      style={{ background: SCREEN_BG }}
      className="w-full flex justify-center"
    >
      <div
        className="w-full max-w-frame flex flex-col relative"
        style={{ background: FRAME_BG, boxShadow: FRAME_SHADOW, minHeight: "100vh" }}
      >
        <OfflineBanner />
        <TopBar />

        {/* Scrollable content. Bottom padding clears the fixed bottom nav
            (nav height + safe-area inset) so nothing hides behind it. */}
        <main
          className="flex-1"
          style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}
        >
          <Outlet />
        </main>

        <BottomNav />

        {/* Always-available voice assistant — floats within the app frame on
            every Shell screen (hides itself on /assistant, which has its own). */}
        <VoiceFab />
      </div>
    </div>
  );
}
