// Central theme file — fonts, colors, layout, and responsive sizing
// shared across screens. Keeping these here means every screen stays
// visually consistent and only needs to tweak one place.
//
// COLORS, THEME, and now FONT_FAMILY are dynamic — the backend can
// push new values for these over the socket, merged on top of the
// defaults below via mergeColors(). SIZES and GRID_COLUMNS are static
// and always come from here directly.

// Static fallback font — used as FONT (legacy alias, unchanged import
// sites keep working) and as the default before the backend has ever
// pushed a fontFamily. Keep this in sync with AppSettings.jsx's
// DEFAULT_FONT_FAMILY.
export const FONT = "'Poppins', sans-serif";
export const DEFAULT_FONT_FAMILY = FONT;

export const GRID_COLUMNS = "8vw minmax(15vw, 1fr) 12vw 22vw";

// Default color palette (ranking/participant screens). Can be
// overridden at runtime — see mergeColors() below.
export const DEFAULT_COLORS = {
  backgroundGradient:
    "radial-gradient(circle at 50% 25%, #1e5a35 0%, #0c2818 45%, #0c2818 100%)",
  headerBorder: "#22c55e",
  headerBorderShadow: "rgba(41, 235, 112, 0.55)",
  white: "#ffffff",
  green: "#4ade80",
  gold: "gold",
  highlightBorder: "#e9ff3f",
  highlightShadow: "rgba(233,255,63,0.4)",
  normalRowBorder: "rgba(255,255,255,0.75)",
  circleBg: "#04140a",
  circleHighlightBorder: "#d4ff3f",
  circleHighlightShadow: "rgba(212,255,63,0.65)",
};

// Central place for every scalable size in the screen.
// Each uses clamp(min, preferred-vw-or-vh, max) so text/shapes grow and shrink
// with the actual window width/height instead of staying fixed in px.
export const SIZES = {
  rankCircle: "clamp(56px, 6vh, 90px)",
  rankNumber: "clamp(22px, 3.2vh, 40px)",
  rowBorderHighlighted: "clamp(4px, 0.5vh, 8px)",
  rowBorderNormal: "clamp(2px, 0.3vh, 3px)",
  participantName: "clamp(22px, 3.4vh, 46px)",
  participantTag: "clamp(16px, 2.2vh, 30px)",
  statValue: "clamp(22px, 3.4vh, 46px)",
  headerTitle: "clamp(24px, 4vh, 48px)",
  headerSide: "clamp(16px, 2.2vh, 30px)",
  sectionTitle: "clamp(18px, 2.4vh, 32px)",
  columnHeader: "clamp(14px, 1.8vh, 28px)",
  waitingText: "clamp(14px, 1.8vh, 22px)",
};

export const FONT_STYLESHEET_URL =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap";

// Default "Go Green" color palette (live power chart screens). Can be
// overridden at runtime — see mergeColors() below.
export const DEFAULT_THEME = {
  bg: "#04140A",
  bgGradient:
    "radial-gradient(circle at 10% -10%, rgba(0,255,140,0.14), transparent 45%), radial-gradient(circle at 90% 110%, rgba(0,255,140,0.08), transparent 45%)",
  panel: "#0B2013",
  panelBorder: "rgba(0,255,140,0.28)",
  panelGlow: "0 0 0 1px rgba(0,255,140,0.15), 0 8px 28px rgba(0,0,0,0.45)",
  neon: "#39FF88",
  neonSoft: "rgba(57,255,136,0.14)",
  gold: "#FFE566",
  text: "#F2FFF6",
  subtext: "#7FDDA0",
  muted: "#4E7A5E",
  divider: "#123319",
};

const GOLDEN_ANGLE = 137.508;

export function hueForIndex(idx) {
  return (idx * GOLDEN_ANGLE) % 360;
}

export function colorForIndex(idx, alpha = 1) {
  const hue = hueForIndex(idx);
  return `hsla(${hue.toFixed(1)}, 85%, 62%, ${alpha})`;
}

// Shallow-merges a partial color/theme/font payload (as pushed from
// the backend) on top of the defaults above. The backend only needs
// to send the keys it wants to override —
//   { colors: { gold: "#ffcc00" }, theme: { neon: "#00ffaa" }, fontFamily: "'Inter', sans-serif" }
// overrides just COLORS.gold, THEME.neon, and the font — everything
// else stays default. fontFamily falls back to whatever was already
// merged in (or DEFAULT_FONT_FAMILY) so a colors-only payload never
// resets the font.
export function mergeColors(overrides = {}, previousFontFamily) {
  const safe = overrides || {};
  const nextFont =
    typeof safe.fontFamily === "string" && safe.fontFamily.trim()
      ? safe.fontFamily
      : previousFontFamily ?? DEFAULT_FONT_FAMILY;

  return {
    colors: { ...DEFAULT_COLORS, ...(safe.colors || {}) },
    theme: { ...DEFAULT_THEME, ...(safe.theme || {}) },
    fontFamily: nextFont,
  };
}

// Handy initial value before the backend has pushed anything.
export const DEFAULT_MERGED_COLORS = mergeColors();

// ---- Legacy aliases (kept so existing direct imports keep working) ----
export const COLORS = DEFAULT_COLORS;
export const THEME = DEFAULT_THEME;