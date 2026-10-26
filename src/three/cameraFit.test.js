import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { fitAligned, fitMargins, alignedCamera, presetFor, coachBlocksCamera } from './cameraFit.js'
import { hudReserve } from '../game/hudLayout.js'

// S05 acceptance: with the aligned preset's el/fov and the board
// half (rim included), every board corner projects inside the NDC
// margins at desktop / portrait / landscape aspects — verified by
// re-projecting with a real THREE.PerspectiveCamera — and the
// returned distance is the closest one (2% less violates).
const EL = 1.0
const FOV = 42
const BOARD_HALF = 10.25
const MARGINS = { x: 0.97, top: 0.8, bottom: 0.93 }
const ASPECTS = [1.6, 0.46, 2.17]
const EPS = 1e-6

function projectWith(fit, aspect, points) {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 500)
  const viewDir = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL))
  const look = new THREE.Vector3(fit.lookX ?? 0, 0, fit.lookZ)
  camera.position.copy(viewDir).multiplyScalar(fit.dist).add(look)
  camera.lookAt(look)
  camera.updateMatrixWorld()
  return points.map(([x, z]) => new THREE.Vector3(x, 0, z).project(camera))
}

const CORNERS = [
  [-BOARD_HALF, -BOARD_HALF],
  [-BOARD_HALF, BOARD_HALF],
  [BOARD_HALF, -BOARD_HALF],
  [BOARD_HALF, BOARD_HALF],
]

const limits = (margins) => ({
  left: margins.x,
  right: margins.right ?? margins.x,
  top: margins.top,
  bottom: margins.bottom,
})

const violates = (corners, margins) => {
  const lim = limits(margins)
  return corners.some(
    (c) => c.x > lim.right + EPS || c.x < -lim.left - EPS || c.y > lim.top + EPS || c.y < -lim.bottom - EPS,
  )
}

describe('fitAligned (S05)', () => {
  for (const aspect of ASPECTS) {
    it(`fits all four board corners inside the margins at aspect ${aspect}`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      expect(Number.isFinite(fit.dist)).toBe(true)
      expect(fit.dist).toBeGreaterThan(0)
      expect(fit.lookX).toBe(0) // symmetric margins never shift sideways
      expect(violates(projectWith(fit, aspect, CORNERS), MARGINS)).toBe(false)
    })

    it(`is the closest fit at aspect ${aspect}: dist - 2% violates a margin`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      const tighter = projectWith({ ...fit, dist: fit.dist * 0.98 }, aspect, CORNERS)
      expect(violates(tighter, MARGINS)).toBe(true)
    })
  }

  it('fills much more of the screen than the old ortho fit (board NDC height)', () => {
    // The plan measured the old fit at 1.48 NDC tall and the
    // prototype at ~1.66; the fit must land in that neighbourhood.
    const fit = fitAligned({ el: EL, fov: FOV, aspect: 1.6, boardHalf: BOARD_HALF, margins: MARGINS })
    const corners = projectWith(fit, 1.6, CORNERS)
    const height = Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y))
    expect(height).toBeGreaterThan(1.6)
    expect(height).toBeLessThanOrEqual(MARGINS.top + MARGINS.bottom + EPS)
  })

  // S05 review round: touch landscape (844x390). The engine passes
  // a top margin derived from the real HUD height (pill bottom
  // 74px + 8px gap at 390px tall -> top = 1 - 2*82/390 = 0.5795)
  // and a right margin that keeps the board left of the Dash /
  // d-pad cluster (cluster left edge at canvas width - 288px, -8px
  // gap -> NDC right = 1 - 592/844 = 0.2986).
  describe('touch landscape margins (aspect 2.17)', () => {
    const LAND = { x: 0.97, right: 0.2986, top: 0.5795, bottom: 0.93 }

    it('fits all four corners inside the tighter top/right margins', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      expect(violates(projectWith(fit, 2.17, CORNERS), LAND)).toBe(false)
      // The board achieves this by sliding sideways, not just by
      // backing away: the look point shifts toward +x (board left).
      expect(fit.lookX).toBeGreaterThan(0)
    })

    it('is the closest fit: dist - 2% violates a margin', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      const tighter = projectWith({ ...fit, dist: fit.dist * 0.98 }, 2.17, CORNERS)
      expect(violates(tighter, LAND)).toBe(true)
    })

    it('keeps the whole board surface left of the control cluster', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      // Sample the board edges every half cell: no point of the
      // board may cross the cluster's left edge in NDC.
      const edge = []
      for (let i = 0; i <= 41; i += 1) {
        const t = -BOARD_HALF + (2 * BOARD_HALF * i) / 41
        edge.push([t, -BOARD_HALF], [t, BOARD_HALF], [-BOARD_HALF, t], [BOARD_HALF, t])
      }
      const pts = projectWith(fit, 2.17, edge)
      for (const p of pts) expect(p.x).toBeLessThanOrEqual(LAND.right + EPS)
    })
  })
})

// ---- H04: the fit follows the real HUD -------------------------------
// alignedCamera() = hudReserve (bar + safe-area + cluster by the one
// controlsVisible rule) -> fitMargins -> fitAligned. Verified at the
// plan's 11 mandatory viewports by re-projecting EVERY board cell
// with a real PerspectiveCamera: no cell may enter the reserved
// rects (top bar band, the cluster rect, the safe-area bands).
const PRESET = { el: EL, fov: FOV, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } }
const GAP = 8
const VIEWPORTS = [
  { name: 'p390', w: 390, h: 844, safe: {} },
  { name: 'p375', w: 375, h: 667, safe: {} },
  { name: 'p414', w: 414, h: 896, safe: {} },
  { name: 'teams375', w: 375, h: 640, safe: {} },
  { name: 'p390safe', w: 390, h: 844, safe: { top: 47, bottom: 34 } },
  { name: 't768', w: 768, h: 1024, safe: {} },
  { name: 'w600', w: 600, h: 800, safe: {} },
  { name: 'l844t', w: 844, h: 390, safe: {} },
  { name: 'l844safe', w: 844, h: 390, safe: { left: 47, right: 47, bottom: 21 } },
  { name: 'l844m', w: 844, h: 390, safe: {} },
  { name: 'd1280', w: 1280, h: 800, safe: {} },
]
const GRID = []
for (let i = 0; i <= 20; i += 1) {
  for (let j = 0; j <= 20; j += 1) GRID.push([-10 + i, -10 + j])
}
const toScreen = (p, w, h) => ({ x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h })
const fitVp = (vp, showControls = false) =>
  alignedCamera({ w: vp.w, h: vp.h, safe: vp.safe, showControls, preset: PRESET, boardHalf: BOARD_HALF })

describe('fitMargins (H04)', () => {
  const BASE = { x: 0.97, top: 0.8, bottom: 0.93 }

  it('portrait + cluster: bottom and softBottom come from the cluster, anchor middle', () => {
    const m = fitMargins(hudReserve({ w: 390, h: 844, safe: {}, showControls: false }), BASE, GAP)
    expect(m.anchor).toBe('middle')
    expect(m.bottom).toBeCloseTo(1 - (2 * (206 + GAP)) / 844, 6) // cluster.h = 190 + 16 inset
    expect(m.softBottom).toBeCloseTo(1 - (2 * (206 + 104 + GAP)) / 844, 6) // + coachStrip 104
    expect(m.right).toBeCloseTo(0.97, 6)
  })

  it('landscape + cluster: the right margin comes from the cluster, no softBottom', () => {
    const m = fitMargins(hudReserve({ w: 844, h: 390, safe: {}, showControls: false }), BASE, GAP)
    expect(m.anchor).toBe('min')
    expect(m.right).toBeCloseTo(1 - (2 * (288 + GAP)) / 844, 6) // cluster.w = 272 + 16 inset
    expect(m.softBottom).toBeUndefined()
    expect(m.top).toBeCloseTo(1 - (2 * (54 + GAP)) / 390, 6) // bar bottom 54 = edge 10 + 44
  })

  it('no cluster (desktop): margins are the preset caps, top still clears the bar', () => {
    const m = fitMargins(hudReserve({ w: 1280, h: 800, safe: {}, showControls: false }), BASE, GAP)
    expect(m).toMatchObject({ x: 0.97, right: 0.97, top: 0.8, bottom: 0.93, anchor: 'min' })
  })
})

describe('alignedCamera at the 11 viewports (H04)', () => {
  for (const vp of VIEWPORTS) {
    it(`${vp.name}: every board cell clears the bar band, the cluster rect and the safe bands`, () => {
      const fit = fitVp(vp)
      const res = hudReserve({ w: vp.w, h: vp.h, safe: vp.safe, showControls: false })
      const pts = projectWith(fit, vp.w / vp.h, [...GRID, ...CORNERS])
      expect(violates(pts, fit.margins)).toBe(false)
      const scr = pts.map((p) => toScreen(p, vp.w, vp.h))
      for (const s of scr) expect(s.y).toBeGreaterThanOrEqual(res.top + GAP - 0.5)
      if (res.cluster && vp.w / vp.h > 1) {
        for (const s of scr) expect(s.x).toBeLessThanOrEqual(vp.w - res.cluster.w - GAP + 0.5)
      }
      if (res.cluster && vp.w / vp.h <= 1) {
        for (const s of scr) expect(s.y).toBeLessThanOrEqual(vp.h - res.cluster.h - GAP + 0.5)
      }
    })

    it(`${vp.name}: dist - 2% (same look) violates a margin`, () => {
      const fit = fitVp(vp)
      const tighter = projectWith({ ...fit, dist: fit.dist * 0.98 }, vp.w / vp.h, CORNERS)
      expect(violates(tighter, fit.margins)).toBe(true)
    })
  }
})

// The aabe5b7 engine model, replicated from
// docs/plan/hud/tooling/fit-baseline-aabe5b7.mjs (mouse / no cluster).
const baselineFit = (w, h) => {
  let top = 0.8
  if (h > 164) top = Math.min(top, 1 - (2 * 82) / h)
  return fitAligned({
    el: EL, fov: FOV, aspect: w / h, boardHalf: BOARD_HALF,
    margins: { x: 0.97, right: 0.97, top, bottom: 0.93 },
  })
}
const nearWidth = (fit, aspect) => {
  const near = projectWith(fit, aspect, [[-BOARD_HALF, BOARD_HALF], [BOARD_HALF, BOARD_HALF]])
  return Math.abs(near[1].x - near[0].x)
}
const boardHeight = (fit, aspect) => {
  const cs = projectWith(fit, aspect, CORNERS)
  return Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y))
}

describe('alignedCamera portrait centring + regression bounds (H04)', () => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) { // p390, teams375
    it(`${vp.name}: top gap and soft-bottom gap balance within 8px`, () => {
      const fit = fitVp(vp)
      const cs = projectWith(fit, vp.w / vp.h, CORNERS)
      const farY = Math.max(...cs.filter((c, i) => i % 2 === 0).map((c) => c.y)) // z = -B corners (idx 0, 2)
      const nearY = Math.min(...cs.filter((c, i) => i % 2 === 1).map((c) => c.y)) // z = +B corners (idx 1, 3)
      const gapTopPx = ((fit.margins.top - farY) * vp.h) / 2
      const gapSoftPx = ((nearY + fit.margins.softBottom) * vp.h) / 2
      expect(Math.abs(gapTopPx - gapSoftPx)).toBeLessThanOrEqual(8)
    })

    it(`${vp.name}: near-edge width is within 1% of the aabe5b7 fit`, () => {
      const aspect = vp.w / vp.h
      expect(nearWidth(fitVp(vp), aspect)).toBeGreaterThanOrEqual(nearWidth(baselineFit(vp.w, vp.h), aspect) * 0.99)
    })
  }

  it('d1280: board height within 2% of the aabe5b7 fit', () => {
    const aspect = 1280 / 800
    const base = boardHeight(baselineFit(1280, 800), aspect)
    const next = boardHeight(fitVp(VIEWPORTS[10]), aspect)
    expect(Math.abs(next - base) / base).toBeLessThanOrEqual(0.02)
  })
})

// ---- V03: portrait reframe once the first-night coach is gone --------
// presetFor() steepens the aligned preset to el 1.2 on portrait while
// the coach is hidden, and hudReserve stops reserving the coach strip
// — the board grows into the freed band. With the coach up, and on
// every non-portrait screen, the fit must stay bit-identical to the
// pre-V03 chain (fitVp above: base preset, default coachVisible).
const projectWithEl = (fit, el, aspect, points) => {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 500)
  const viewDir = new THREE.Vector3(0, Math.sin(el), Math.cos(el))
  const look = new THREE.Vector3(fit.lookX ?? 0, 0, fit.lookZ)
  camera.position.copy(viewDir).multiplyScalar(fit.dist).add(look)
  camera.lookAt(look)
  camera.updateMatrixWorld()
  return points.map(([x, z]) => new THREE.Vector3(x, 0, z).project(camera))
}
const boardHeightPx = (fit, el, vp) => {
  const cs = projectWithEl(fit, el, vp.w / vp.h, CORNERS)
  return ((Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y))) * vp.h) / 2
}
const nearWidthEl = (fit, el, aspect) => {
  const near = projectWithEl(fit, el, aspect, [[-BOARD_HALF, BOARD_HALF], [BOARD_HALF, BOARD_HALF]])
  return Math.abs(near[1].x - near[0].x)
}
const fitCoachOff = (vp) => {
  const preset = presetFor(PRESET, { w: vp.w, h: vp.h, coachVisible: false })
  return {
    el: preset.el,
    fit: alignedCamera({ w: vp.w, h: vp.h, safe: vp.safe, showControls: false, preset, boardHalf: BOARD_HALF, coachVisible: false }),
  }
}

describe('presetFor (V03)', () => {
  it('steepens to el 1.2 only for portrait with the coach hidden', () => {
    const off = presetFor(PRESET, { w: 390, h: 844, coachVisible: false })
    expect(off.el).toBe(1.2)
    expect(off).not.toBe(PRESET)
    expect(PRESET.el).toBe(EL) // base preset not mutated
    expect(presetFor(PRESET, { w: 390, h: 844, coachVisible: true })).toBe(PRESET)
    expect(presetFor(PRESET, { w: 844, h: 390, coachVisible: false })).toBe(PRESET)
    expect(presetFor(PRESET, { w: 800, h: 800, coachVisible: false })).toBe(PRESET)
  })

  it('hudReserve reserves the coach strip only while the coach can show', () => {
    const on = hudReserve({ w: 390, h: 844, safe: {}, showControls: false })
    const off = hudReserve({ w: 390, h: 844, safe: {}, showControls: false, coachVisible: false })
    expect(on.coachStrip).toBeGreaterThan(0)
    expect(off.coachStrip).toBeUndefined()
    expect(off.cluster).toEqual(on.cluster)
  })
})

describe('portrait board with the coach gone (V03)', () => {
  const MIN_H = { p390: 320, p375: 300, p414: 340, teams375: 300, p390safe: 320 }
  for (const vp of VIEWPORTS.slice(0, 5)) {
    it(`${vp.name}: board is at least ${MIN_H[vp.name]}px tall and no narrower at the near edge`, () => {
      const { fit, el } = fitCoachOff(vp)
      expect(el).toBe(1.2)
      expect(boardHeightPx(fit, el, vp)).toBeGreaterThanOrEqual(MIN_H[vp.name])
      const aspect = vp.w / vp.h
      const masterNearPx = (nearWidth(fitVp(vp), aspect) * vp.w) / 2
      const nearPx = (nearWidthEl(fit, el, aspect) * vp.w) / 2
      expect(nearPx).toBeGreaterThanOrEqual(masterNearPx - 1)
    })
  }
  // Every portrait viewport (incl. the t768 / w600 windows) keeps the
  // H04 clearance guarantee in the reframed fit.
  for (const vp of VIEWPORTS.filter((v) => v.w / v.h <= 1)) {
    it(`${vp.name}: every board cell still clears the bar band, the cluster rect and the safe bands`, () => {
      const { fit, el } = fitCoachOff(vp)
      const res = hudReserve({ w: vp.w, h: vp.h, safe: vp.safe, showControls: false, coachVisible: false })
      const pts = projectWithEl(fit, el, vp.w / vp.h, [...GRID, ...CORNERS])
      expect(violates(pts, fit.margins)).toBe(false)
      const scr = pts.map((p) => toScreen(p, vp.w, vp.h))
      for (const s of scr) expect(s.y).toBeGreaterThanOrEqual(res.top + GAP - 0.5)
      for (const s of scr) expect(s.y).toBeLessThanOrEqual(vp.h - res.cluster.h - GAP + 0.5)
    })
  }
})

describe('coach visible / non-portrait fits are unchanged (V03)', () => {
  for (const vp of VIEWPORTS) {
    it(`${vp.name}: coach-visible fit equals the pre-V03 fit exactly`, () => {
      const preset = presetFor(PRESET, { w: vp.w, h: vp.h, coachVisible: true })
      const fit = alignedCamera({ w: vp.w, h: vp.h, safe: vp.safe, showControls: false, preset, boardHalf: BOARD_HALF, coachVisible: true })
      const before = fitVp(vp)
      expect(fit.dist).toBe(before.dist)
      expect(fit.lookX).toBe(before.lookX)
      expect(fit.lookZ).toBe(before.lookZ)
    })
  }
  for (const vp of VIEWPORTS.filter((v) => v.w / v.h > 1)) {
    it(`${vp.name}: coach state changes nothing outside portrait`, () => {
      const { fit } = fitCoachOff(vp)
      const before = fitVp(vp)
      expect(fit.dist).toBe(before.dist)
      expect(fit.lookX).toBe(before.lookX)
      expect(fit.lookZ).toBe(before.lookZ)
    })
  }
})

// V03 fix (owner review): on the first night the coach is due from the
// ready beat — the camera must hold the coach framing for the whole run
// so it never tilts el 1.2 → 1.0 → 1.2 mid-game.
describe('coachBlocksCamera (V03 fix — first night holds the old framing)', () => {
  it('a visible coach step always blocks', () => {
    expect(coachBlocksCamera({ coachStep: 0, night: 3, onboarded: true })).toBe(true)
  })

  it('night 0 (fresh storage, no night started) also blocks', () => {
    expect(coachBlocksCamera({ coachStep: -1, night: 0, onboarded: false })).toBe(true)
    expect(coachBlocksCamera({ coachStep: -1, night: 0, onboarded: true })).toBe(false)
  })

  it('night 1, not onboarded: blocked on every screen, title included', () => {
    for (const _status of ['title', 'prologue', 'ready', 'playing', 'paused', 'dead'])
      expect(coachBlocksCamera({ coachStep: -1, night: 1, onboarded: false })).toBe(true)
  })

  it('once onboarded, night 1 no longer blocks (the one reframe to el 1.2)', () => {
    expect(coachBlocksCamera({ coachStep: -1, night: 1, onboarded: true })).toBe(false)
  })

  it('later nights never block on the pending rule', () => {
    expect(coachBlocksCamera({ coachStep: -1, night: 2, onboarded: false })).toBe(false)
  })

  it('night-1 journey: title (night 0) → prologue → ready → playing → coach 0..2 → dismiss changes exactly once', () => {
    // The real store starts at night 0 on fresh storage and only becomes
    // 1 in start() — the round-2 test fed night 1 for title and missed
    // the title→prologue tilt. onboarded flips to true at dismiss,
    // exactly as dismissCoach does (writeItem before set({coachStep: -1})).
    const journey = [
      { status: 'title', coachStep: -1, night: 0, onboarded: false },
      { status: 'prologue', coachStep: -1, night: 1, onboarded: false },
      { status: 'ready', coachStep: -1, night: 1, onboarded: false },
      { status: 'playing', coachStep: -1, night: 1, onboarded: false },
      { status: 'playing', coachStep: 0, night: 1, onboarded: false },
      { status: 'playing', coachStep: 1, night: 1, onboarded: false },
      { status: 'playing', coachStep: 2, night: 1, onboarded: false },
      { status: 'playing', coachStep: -1, night: 1, onboarded: true },
    ]
    const held = journey.map((s) => coachBlocksCamera(s))
    expect(held.slice(0, 7)).toEqual([true, true, true, true, true, true, true])
    expect(held[7]).toBe(false)
    const changes = held.slice(1).filter((v, i) => v !== held[i]).length
    expect(changes).toBe(1)
    // The camera angle follows the same single transition (p390 chain).
    const vp = VIEWPORTS[0]
    const els = journey.map(
      (s) => presetFor(PRESET, { w: vp.w, h: vp.h, coachVisible: coachBlocksCamera(s) }).el,
    )
    expect(els.slice(0, 7)).toEqual([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0])
    expect(els[7]).toBe(1.2)
  })

  it('the held night-1 framing equals the coach-visible fit; onboarded reframes', () => {
    // p390 chain exactly as the engine runs it.
    const vp = VIEWPORTS[0]
    const fit = (coachVisible) =>
      alignedCamera({
        w: vp.w, h: vp.h, safe: vp.safe, showControls: false,
        preset: presetFor(PRESET, { w: vp.w, h: vp.h, coachVisible }),
        boardHalf: BOARD_HALF,
        coachVisible,
      })
    const held = coachBlocksCamera({ coachStep: -1, night: 1, onboarded: false })
    expect(held).toBe(true)
    expect(fit(held).dist).toBe(fitVp(vp).dist) // night 1 = pre-V03 framing
    const done = coachBlocksCamera({ coachStep: -1, night: 1, onboarded: true })
    expect(done).toBe(false)
    expect(fit(done).dist).toBe(fitCoachOff(vp).fit.dist) // coach done → the V03 reframe
    expect(fit(done).dist).not.toBe(fitVp(vp).dist)
  })
})
