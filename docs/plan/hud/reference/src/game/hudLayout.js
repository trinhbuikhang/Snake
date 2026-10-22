// REFERENCE PROTOTYPE (docs/plan/HUD_PLAN.md) — copy of the prototype's src/game/hudLayout.js; not imported by the game.
// HUD layout tokens + pure layout rules (REFERENCE PROTOTYPE, HUD plan).
//
// One source of truth for the numbers the CSS lays out and the camera
// fit must keep clear of. styles.css reads the same values through the
// --hud-* custom properties in :root (hudLayout.test.js keeps them
// equal to HUD below); engine.js asks
// hudReserve() which screen bands the board has to avoid.

export const HUD = {
  edge: 10, // bar inset from the screen edge (before safe-area)
  barH: 44, // stat capsule + round buttons share one 44px row
  btn: 44, // round icon/pause button (tap target >= 44)
  gap: 8, // gap between bar items
  fitGap: 8, // breathing room between board and any HUD band
  padInset: 16, // touch cluster inset from bottom/right (before safe-area)
  padGap: 8, // gap between d-pad buttons
  dashGap: 16, // gap Dash <-> d-pad
  coachH: 92, // max height of the compact coach card (portrait strip above the pad)
  coachGap: 12, // coach card <-> d-pad
}

// Below this width the bar keeps only stats + Pause; camera / touch pad /
// sound live in the pause sheet. At or above it every toggle sits inline.
export const COMPACT_MAX_W = 560
// Same breakpoint the old CSS media query used for the touch cluster.
export const CONTROLS_MAX_W = 900

export const isCompact = (w) => w < COMPACT_MAX_W

export const controlsVisible = (w, showControls) => !!showControls || w <= CONTROLS_MAX_W

// .dpad grid tracks are 58px at every width (only the buttons shrink to
// 52px under 480px), so the pad is always 190px; Dash shrinks 66 -> 56.
export function clusterSize(w) {
  const small = w <= 480
  const btn = small ? 52 : 58
  const dash = small ? 56 : 66
  const pad = 3 * 58 + 2 * HUD.padGap
  return { btn, dash, pad, w: dash + HUD.dashGap + pad, h: pad }
}

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

// Screen bands (CSS px) the board must stay out of.
export function hudReserve({ w, h, safe = ZERO, showControls = false }) {
  const s = { ...ZERO, ...safe }
  const barTop = Math.max(HUD.edge, s.top)
  const out = {
    w,
    h,
    top: barTop + HUD.barH,
    left: s.left,
    right: s.right,
    bottom: s.bottom,
    cluster: null,
  }
  if (controlsVisible(w, showControls)) {
    const c = clusterSize(w)
    out.cluster = {
      w: c.w + Math.max(HUD.padInset, s.right),
      h: c.h + Math.max(HUD.padInset, s.bottom),
    }
    // Portrait: the strip just above the pad is kept for the coach card
    // when the board can spare it (soft reserve, see fitMargins).
    if (w / h <= 1) out.coachStrip = HUD.coachGap + HUD.coachH
  }
  return out
}

// Where the first-night coach card goes so it never sits on the pad,
// the bar, or (at the listed viewports) the board.
//  'above-pad'  portrait with touch cluster: full-width card just above the pad
//  'pad-column' landscape with touch cluster: in the column above the pad
//  'top-left'   no cluster (desktop): small card under the bar, left side
export function coachPlacement({ w, h, showControls }) {
  if (!controlsVisible(w, showControls)) return 'top-left'
  return w / h > 1 ? 'pad-column' : 'above-pad'
}

// Reads env(safe-area-inset-*) through a CSS probe (.safe-probe in
// styles.css) so JS sees exactly what the CSS sees.
let probe = null
export function readSafeArea() {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || typeof getComputedStyle !== 'function') return { ...ZERO }
  if (!probe) {
    probe = document.createElement('div')
    probe.className = 'safe-probe'
    probe.setAttribute('aria-hidden', 'true')
    const host = document.body || document.documentElement
    host.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  const px = (v) => parseFloat(v) || 0
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) }
}
