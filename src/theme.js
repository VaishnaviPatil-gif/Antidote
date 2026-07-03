/**
 * Antidote+ — shared design tokens.
 *
 * `C` is extracted VERBATIM from AntidotePlus_Routing.jsx so the whole app
 * speaks one visual language: teal/orange brand, the same pales for status
 * tints, the same dark for ink. Import this everywhere — never redefine a
 * colour inline. The routing screen now imports `C` from here too.
 */
export const C = {
  teal: "#0D6E6E",
  tealLight: "#1A9999",
  tealPale: "#E6F4F4",
  tealDark: "#0A4F4F",
  orange: "#E86A17",
  orangePale: "#FEF0E6",
  dark: "#142826",
  muted: "#5E7A78",
  danger: "#C0392B",
  dangerPale: "#FBEBE9",
  good: "#1F8A5B",
  goodPale: "#E7F4EE",
  amber: "#B8730A",
  amberPale: "#FBF1E0",
};

/**
 * Shared layout constants so every screen frames identically to routing.
 * FRAME_BG is the inner card; SCREEN_BG is the ambient backdrop behind it.
 */
export const FRAME_BG = "#F7FAFA";
export const SCREEN_BG = "#EDF3F2";
export const FRAME_SHADOW = "0 12px 48px rgba(10,79,79,.16)";

/** Severity → brand tone, used identically across tracker / routing / SOS. */
export const SEVERITY_TONE = {
  mild: C.good,
  moderate: C.amber,
  severe: C.danger,
  critical: "#7B1FA2",
};

/** Severity → soft background tint that pairs with SEVERITY_TONE. */
export const SEVERITY_PALE = {
  mild: C.goodPale,
  moderate: C.amberPale,
  severe: C.dangerPale,
  critical: "#F3E5F5",
};
