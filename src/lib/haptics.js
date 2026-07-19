/**
 * haptics — tiny, dependency-free tactile feedback.
 *
 * Deliberately uses the web `navigator.vibrate` API rather than a Capacitor
 * plugin: it works inside the Android WebView, degrades to a silent no-op on
 * iOS/desktop where vibration isn't exposed, and adds NO native plugin — so the
 * Android build stays a fast incremental (adding a plugin forces a slow full
 * rebuild, see the build-env notes). Every call is wrapped so a blocked or
 * missing API can never throw into React.
 *
 * Patterns are short and purposeful — this is emergency UX, not a game.
 */

function buzz(pattern) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* vibration blocked / unsupported — silent no-op */
  }
}

/** A light tap — button presses, mic start. */
export function tap() {
  buzz(15);
}

/** A soft double for a completed/confirmed action. */
export function success() {
  buzz([12, 40, 12]);
}

/** A firmer buzz for warnings / SOS-level actions. */
export function warn() {
  buzz([25, 60, 25]);
}

/** Stop any ongoing vibration. */
export function stop() {
  buzz(0);
}
