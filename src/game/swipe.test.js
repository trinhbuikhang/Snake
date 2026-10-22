// One-finger swipe tracker (POLISH_PLAN C02): the nine scenarios of
// docs/plan/polish/tooling/swipe-sim.mjs, ported to run against the real
// src/game/swipe.js under `npm test`. Touch model matches the simulator
// (and browsers): `touches` lists EVERY finger on the screen in landing
// order, `changedTouches` only the finger the event is about, and events
// for a finger that went down on the Dash button never reach the canvas.
import { describe, it, expect } from 'vitest'
import { createSwipeTracker } from './swipe.js'

// The engine's wiring, mirrored: tracker out → requestTurn.
function swipeHandlers(requestTurn) {
  const tr = createSwipeTracker()
  return {
    onTouchStart: (e) => tr.start(e),
    onTouchMove: (e) => {
      const k = tr.move(e)
      if (k) requestTurn(k)
    },
    onTouchEnd: (e) => tr.end(e),
    onTouchCancel: () => tr.cancel(),
  }
}

// A tiny touch screen. fingers: id -> { x, y, onCanvas }
function screen(handlers) {
  const fingers = new Map()
  const list = () =>
    [...fingers.entries()].map(([fid, f]) => ({ identifier: fid, clientX: f.x, clientY: f.y }))
  const ev = (fid) => ({
    touches: list(),
    changedTouches: list().filter((t) => t.identifier === fid),
    preventDefault() {},
  })
  return {
    down(fid, x, y, onCanvas = true) {
      fingers.set(fid, { x, y, onCanvas })
      if (onCanvas) handlers.onTouchStart(ev(fid))
    },
    move(fid, x, y) {
      const f = fingers.get(fid)
      f.x = x
      f.y = y
      if (f.onCanvas) handlers.onTouchMove(ev(fid))
    },
    up(fid) {
      const f = fingers.get(fid)
      const e = ev(fid)
      fingers.delete(fid)
      if (f.onCanvas) handlers.onTouchEnd({ ...e, touches: list() })
    },
    cancel(fid) {
      const f = fingers.get(fid)
      fingers.delete(fid)
      if (f.onCanvas) handlers.onTouchCancel()
    },
  }
}

// Move a finger along a polyline in 4px steps (a 120Hz digitiser at ~500px/s).
function drag(s, fid, pts) {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1]
    const [x1, y1] = pts[k]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4))
    for (let i = 1; i <= n; i++) s.move(fid, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)
  }
}

const DASH = [300, 780] // the Dash button at 390x844 (bottom-right cluster)

const SCENARIOS = [
  { id: 'S1', name: 'straight swipe up 60px', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 340]]); s.up(1) } },
  { id: 'S2', name: 'tap with 8px jitter', expect: [], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [156, 405]]); s.up(1) } },
  { id: 'S3', name: 'flick up 40px that curls 30px right at the end', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [152, 370], [160, 356], [182, 350]]); s.up(1) } },
  { id: 'S4', name: 'L-swipe: up 50px then right 50px (two turns intended)', expect: ['up', 'right'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 350], [200, 350]]); s.up(1) } },
  { id: 'S5', name: 'diagonal-ish swipe 24px right / 22px up', expect: ['up|right'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [174, 378]]); s.up(1) } },
  { id: 'S6', name: 'Dash held (thumb 9) + swipe up 60px (thumb 1)', expect: ['up'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 340]]); s.up(1); s.up(9) } },
  { id: 'S7', name: 'Dash held + swipe left 60px', expect: ['left'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 200, 400); drag(s, 1, [[200, 400], [140, 400]]); s.up(1); s.up(9) } },
  { id: 'S8', name: 'swipe right starts, Dash released mid-swipe, finger moves 4px more', expect: ['right'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 100, 400); drag(s, 1, [[100, 400], [124, 400]]); s.up(9); drag(s, 1, [[124, 400], [128, 400]]); s.up(1) } },
  { id: 'S9', name: 'second finger lands on the lake while first swipes up', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 370]]); s.down(2, 250, 300); drag(s, 1, [[150, 370], [150, 350]]); s.up(2); s.up(1) } },
]

describe('swipe scenarios S1–S9 (C02)', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: ${sc.name}`, () => {
      const got = []
      // A repeat of the same key is always rejected by turn() downstream,
      // so consecutive duplicates collapse — only distinct requests count.
      const h = swipeHandlers((k) => {
        if (got[got.length - 1] !== k) got.push(k)
      })
      sc.play(screen(h))
      expect(got.length).toBe(sc.expect.length)
      sc.expect.forEach((e, i) => expect(e.split('|')).toContain(got[i]))
    })
  }
})

describe('swipe tracker extras (C02)', () => {
  it('three turns in one gesture (up 40, right 40, down 40 px) produce exactly three turns', () => {
    const got = []
    const s = screen(swipeHandlers((k) => got.push(k)))
    s.down(1, 150, 400)
    drag(s, 1, [[150, 400], [150, 360], [190, 360], [190, 400]])
    s.up(1)
    expect(got).toEqual(['up', 'right', 'down'])
  })

  it('touchcancel resets: the rest of the gesture is dead and the next touch starts fresh', () => {
    const got = []
    const s = screen(swipeHandlers((k) => got.push(k)))
    s.down(1, 150, 400)
    drag(s, 1, [[150, 400], [150, 388]]) // 12px — below the first-turn threshold
    s.cancel(1)
    // A cancelled finger produces no further events in a browser, but a
    // fresh touch must behave like a brand-new gesture (18px first turn).
    s.down(2, 150, 400)
    drag(s, 2, [[150, 400], [150, 388]])
    expect(got).toEqual([])
    drag(s, 2, [[150, 388], [150, 378]])
    expect(got).toEqual(['up'])
    s.up(2)
  })

  it("another finger's touchend does not end the tracked gesture", () => {
    const got = []
    const s = screen(swipeHandlers((k) => got.push(k)))
    s.down(1, 150, 400)
    s.down(2, 250, 300)
    s.up(2) // untracked finger lifts — tracking of finger 1 must survive
    drag(s, 1, [[150, 400], [150, 340]])
    expect(got).toEqual(['up'])
    s.up(1)
  })

  it('a long straight swipe is one turn, however far it travels', () => {
    const got = []
    const s = screen(swipeHandlers((k) => got.push(k)))
    s.down(1, 150, 500)
    drag(s, 1, [[150, 500], [150, 200]])
    s.up(1)
    expect(got).toEqual(['up'])
  })
})
