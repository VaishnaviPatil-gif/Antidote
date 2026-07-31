import React from "react";
import { C, SCREEN_BG, FRAME_BG } from "../theme.js";

/**
 * App-wide error boundary.
 *
 * A single uncaught render error anywhere in the tree (e.g. a lazy chunk failing
 * to init, or the Leaflet map on an unusual device) would otherwise blank the
 * screen mid-demo. This catches it and shows an on-brand recovery card instead.
 *
 * Deliberately dependency-light and NOT internationalised: a crash may originate
 * anywhere, so the fallback avoids hooks/context/i18n and uses only static
 * strings + brand tokens. "Reload" retries; "Start over" clears saved emergency
 * state (in case a corrupt session is the trigger) and reloads.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface it for debugging; never swallow silently.
    // eslint-disable-next-line no-console
    console.error("Antidote+ crashed:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.removeItem("antidote.emergency.v1");
    } catch {
      /* storage unavailable — reload still gives a clean render */
    }
    window.location.assign("/");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{ background: SCREEN_BG, minHeight: "100vh" }}
        className="w-full flex justify-center"
      >
        <div
          className="w-full max-w-frame flex flex-col items-center justify-center px-6 text-center gap-4"
          style={{ background: FRAME_BG, minHeight: "100vh" }}
        >
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{ background: C.dangerPale, width: 56, height: 56 }}
          >
            <span style={{ color: C.danger, fontSize: 28, fontWeight: 800 }}>!</span>
          </div>
          <div>
            <h1 className="text-lg font-extrabold" style={{ color: C.dark }}>
              Something went wrong
            </h1>
            <p className="text-sm leading-snug mt-1" style={{ color: C.muted }}>
              The app hit an unexpected error. Your emergency data is saved on
              this device — reload to continue where you left off.
            </p>
            {this.state.error && (
              <div className="mt-3 p-2 bg-red-50 text-red-700 text-xs font-mono rounded text-left overflow-auto max-h-32 border border-red-200">
                <strong>Error:</strong> {this.state.error.toString()}
                <br />
                {this.state.error.stack}
              </div>
            )}
          </div>
          <div className="w-full flex flex-col gap-2" style={{ maxWidth: 320 }}>
            <button
              onClick={this.handleReload}
              className="w-full rounded-xl text-white font-bold active:scale-[.98] transition-transform"
              style={{ background: C.teal, height: 52, fontSize: 16 }}
            >
              Reload
            </button>
            <button
              onClick={this.handleReset}
              className="w-full rounded-xl border font-semibold active:scale-[.98] transition-transform bg-white"
              style={{ borderColor: "#D7E3E2", color: C.muted, height: 48, fontSize: 14 }}
            >
              Start over (clear saved emergency)
            </button>
          </div>
        </div>
      </div>
    );
  }
}
