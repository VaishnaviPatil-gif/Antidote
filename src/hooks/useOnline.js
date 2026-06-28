import { useState, useEffect } from "react";

/**
 * Tracks real connectivity via the browser's online/offline events.
 *
 * Used by the global offline banner (§2.9) and by any data screen that must
 * fall back to cached values (e.g. hospital stock shown as "last known").
 * No fakery — on stage you drop signal in devtools and this flips for real.
 *
 * @returns {boolean} true when online, false when the device reports offline.
 */
export function useOnline() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
