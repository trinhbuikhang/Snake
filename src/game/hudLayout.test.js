import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  HUD, COMPACT_MAX_W, CONTROLS_MAX_W,
  isCompact, controlsVisible, clusterSize, hudReserve, coachPlacement, readSafeArea,
} from './hudLayout.js'

// H01 acceptance: the layout value table from the plan, the
// safe-area arithmetic, the coach placement table, CSS sync
// (styles.css must carry the same numbers as HUD), and a
// readSafeArea() that never throws without a DOM.
describe('hudLayout tokens (H01)', () => {
  it('exposes the settled token values', () => {
    expect(HUD).toEqual({
      edge: 10, barH: 44, btn: 44, gap: 8, fitGap: 8,
      padInset: 16, padGap: 8, dashGap: 16, coachH: 92, coachGap: 12,
    })
    expect(COMPACT_MAX_W).toBe(560)
    expect(CONTROLS_MAX_W).toBe(900)
  })

  it('isCompact flips at 560', () => {
    expect(isCompact(559)).toBe(true)
    expect(isCompact(560)).toBe(false)
    expect(isCompact(375)).toBe(true)
    expect(isCompact(1280)).toBe(false)
  })

  it('controlsVisible: forced on, or width <= 900', () => {
    expect(controlsVisible(844, false)).toBe(true) // small desktop window
    expect(controlsVisible(900, false)).toBe(true)
    expect(controlsVisible(901, false)).toBe(false)
    expect(controlsVisible(1280, false)).toBe(false)
    expect(controlsVisible(1280, true)).toBe(true)
  })

  it('clusterSize matches the plan table (pad tracks never shrink)', () => {
    expect(clusterSize(390)).toEqual({ btn: 52, dash: 56, pad: 190, w: 262, h: 190 })
    expect(clusterSize(844)).toEqual({ btn: 58, dash: 66, pad: 190, w: 272, h: 190 })
    expect(clusterSize(480).dash).toBe(56)
    expect(clusterSize(481).dash).toBe(66)
  })
})

describe('hudReserve (H01)', () => {
  it('top = max(edge, safe.top) + barH', () => {
    expect(hudReserve({ w: 390, h: 844 }).top).toBe(54)
    expect(hudReserve({ w: 390, h: 844, safe: { top: 47 } }).top).toBe(91)
    expect(hudReserve({ w: 1280, h: 800, safe: { top: 0 } }).top).toBe(54)
  })

  it('passes safe-area edges through and reports no cluster on wide screens', () => {
    const r = hudReserve({ w: 1280, h: 800, safe: { left: 12, right: 12, bottom: 9 } })
    expect(r.left).toBe(12)
    expect(r.right).toBe(12)
    expect(r.bottom).toBe(9)
    expect(r.cluster).toBeNull()
    expect(r.coachStrip).toBeUndefined()
  })

  it('cluster rect grows by the larger of padInset and the safe-area inset', () => {
    // 844x390 with safe right 47: w = 272 + 47, h = 190 + max(16, 0)
    expect(hudReserve({ w: 844, h: 390, safe: { right: 47 } }).cluster).toEqual({ w: 319, h: 206 })
    // forced on at desktop size
    expect(hudReserve({ w: 1280, h: 800, showControls: true }).cluster).toEqual({ w: 288, h: 206 })
  })

  it('portrait with a cluster reserves the coach strip; landscape does not', () => {
    expect(hudReserve({ w: 390, h: 844 }).coachStrip).toBe(HUD.coachGap + HUD.coachH)
    expect(hudReserve({ w: 844, h: 390 }).coachStrip).toBeUndefined()
  })
})

describe('coachPlacement (H01)', () => {
  it('follows the plan table', () => {
    expect(coachPlacement({ w: 390, h: 844 })).toBe('above-pad')
    expect(coachPlacement({ w: 844, h: 390 })).toBe('pad-column')
    expect(coachPlacement({ w: 1280, h: 800 })).toBe('top-left')
    expect(coachPlacement({ w: 1280, h: 800, showControls: true })).toBe('pad-column')
    expect(coachPlacement({ w: 600, h: 800 })).toBe('above-pad') // narrow portrait window, cluster by width
  })

  it('covers the 11 harness viewports (H05, showControls off)', () => {
    const table = [
      ['p390', 390, 844, 'above-pad'],
      ['p375', 375, 667, 'above-pad'],
      ['p414', 414, 896, 'above-pad'],
      ['teams375', 375, 640, 'above-pad'],
      ['p390safe', 390, 844, 'above-pad'],
      ['t768', 768, 1024, 'above-pad'],
      ['w600', 600, 800, 'above-pad'],
      ['l844t', 844, 390, 'pad-column'],
      ['l844safe', 844, 390, 'pad-column'],
      ['l844m', 844, 390, 'pad-column'],
      ['d1280', 1280, 800, 'top-left'],
    ]
    for (const [name, w, h, want] of table) {
      expect(coachPlacement({ w, h, showControls: false }), name).toBe(want)
    }
  })

  it('the three placement classes exist in styles.css (H05)', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    for (const cls of ['coach-marks--above-pad', 'coach-marks--pad-column', 'coach-marks--top-left']) {
      expect(css).toContain(`.${cls}`)
    }
    expect(css).toContain('.coach-card__foot')
  })
})

describe('CSS sync (H01)', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

  it(':root --hud-* variables equal the HUD tokens', () => {
    expect(css).toContain(`--hud-edge: ${HUD.edge}px;`)
    expect(css).toContain(`--hud-bar-h: ${HUD.barH}px;`)
    expect(css).toContain(`--hud-btn: ${HUD.btn}px;`)
    expect(css).toContain(`--hud-gap: ${HUD.gap}px;`)
  })

  it('.dpad tracks and .btn-boost sizes match clusterSize', () => {
    expect(css).toContain('grid-template-columns: repeat(3, 58px)')
    expect(css).toMatch(/\.btn-boost\s*\{[^}]*width: 66px/)
    // the <=480px adjustments: Dash 56, pad buttons 52
    const mobile = css.slice(css.indexOf('@media (max-width: 480px)'))
    expect(mobile).toMatch(/\.btn-boost\s*\{\s*width: 56px/)
    expect(mobile).toMatch(/\.dbtn\s*\{\s*width: 52px/)
  })

  it('defines the .safe-probe the safe-area reader relies on', () => {
    expect(css).toMatch(/\.safe-probe\s*\{[^}]*padding: env\(safe-area-inset-top/)
  })
})

describe('readSafeArea (H01)', () => {
  afterEach(() => {
    delete globalThis.document
  })

  it('returns zeros without a DOM (Node test env)', () => {
    expect(readSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('returns zeros when document has no createElement (mock)', () => {
    globalThis.document = {}
    expect(readSafeArea()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})
