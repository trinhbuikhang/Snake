// HUD layout tokens + pure layout rules (HUD plan, H01).
//
// One source of truth for the numbers the CSS lays out and the
// camera fit must keep clear of. styles.css carries the same
// values through the --hud-* custom properties in :root
// (hudLayout.test.js keeps them equal to HUD below), and the
// camera fit (H04) asks hudReserve() which screen bands the board
// has to avoid. Pure module: no React, no Three, no DOM except
// readSafeArea()'s guarded probe.

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

// Below this width the top bar keeps only stats + Pause; camera /
// touch pad / sound live in the pause sheet instead.
export const COMPACT_MAX_W = 560
// Same breakpoint the old CSS media query used for the touch cluster.
export const CONTROLS_MAX_W = 900

export const isCompact = (w) => w < COMPACT_MAX_W

// The touch cluster is on screen when the player forced it on OR
// the viewport is narrow — ONE rule for rendering (Hud) and for
// the camera reserve (engine). No more pointer: coarse divergence.
export const controlsVisible = (w, showControls) => !!showControls || w <= CONTROLS_MAX_W

// .dpad grid tracks are 58px at every width (only the buttons
// shrink to 52px under 480px), so the pad is always 190px wide;
// Dash shrinks 66 -> 56 under 480px. Keep in sync with styles.css
// (.dpad / .btn-boost) — the test asserts both sides.
export function clusterSize(w) {
  const small = w <= 480
  const btn = small ? 52 : 58
  const dash = small ? 56 : 66
  const pad = 3 * 58 + 2 * HUD.padGap
  return { btn, dash, pad, w: dash + HUD.dashGap + pad, h: pad }
}

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

// Screen bands (CSS px) the board must stay out of: the top bar,
// the safe-area edges, and — when the touch cluster is visible —
// the cluster's rect at the bottom-right. Portrait also reports
// coachStrip: the band just above the pad reserved for the coach
// card (a soft reserve for the camera fit, see H04/H05).
export function hudReserve({ w, h, safe = ZERO, showControls = false, coachVisible = true }) {
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
    // V03: the coach strip is only reserved while the first-night
    // coach can actually be on screen; once it is gone the portrait
    // board may use the band down to the cluster.
    if (w / h <= 1 && coachVisible) out.coachStrip = HUD.coachGap + HUD.coachH
  }
  return out
}

// Where the first-night coach card goes so it never sits on the
// pad, the bar, or (at the measured viewports) the board:
//  'above-pad'  portrait with touch cluster: full-width card just above the pad
//  'pad-column' landscape with touch cluster: the column above the pad
//  'top-left'   no cluster (desktop): small card under the bar, left side
export function coachPlacement({ w, h, showControls }) {
  if (!controlsVisible(w, showControls)) return 'top-left'
  return w / h > 1 ? 'pad-column' : 'above-pad'
}

// Reads env(safe-area-inset-*) through a CSS probe (.safe-probe in
// styles.css) so JS sees exactly what the CSS sees. Safe in Node /
// tests: without document.createElement or getComputedStyle it
// returns zeros instead of throwing.
let probe = null
export function readSafeArea() {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof getComputedStyle !== 'function'
  ) {
    return { ...ZERO }
  }
  if (!probe) {
    probe = document.createElement('div')
    probe.className = 'safe-probe'
    probe.setAttribute('aria-hidden', 'true')
    const host = document.body || document.documentElement
    host.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  const px = (v) => parseFloat(v) || 0
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  }
}
