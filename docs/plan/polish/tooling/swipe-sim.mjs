// Swipe-input simulator for docs/plan/POLISH_PLAN.md (workstream C).
// Tooling only — not part of the game build, not part of `npm test`.
//
// `engineSwipe()` below is a VERBATIM copy of the canvas touch handlers in
// src/three/engine.js @ f9d1dd6 (onTouchStart / onTouchMove / onTouchEnd,
// "Touch swipe on the canvas with smooth threshold"), with requestTurn
// injected. Scripted touch traces are replayed as TouchEvent-shaped
// objects with the semantics browsers use: `touches` lists EVERY finger on
// the screen (in the order they went down), `targetTouches` only those that
// started on the canvas, `changedTouches` the finger(s) this event is about.
// Events for a finger that went down on the Dash button are delivered to the
// button, never to the canvas.
//
// usage (repo root): node docs/plan/polish/tooling/swipe-sim.mjs [--reference] [--json out.json]
import fs from 'fs'

export function engineSwipe(requestTurn) {
  const pointer = { active: false, sx: 0, sy: 0 }
  const onTouchStart = (e) => {
    const t = e.touches[0]
    pointer.active = true
    pointer.sx = t.clientX
    pointer.sy = t.clientY
  }
  const onTouchMove = (e) => {
    if (!pointer.active) return
    const t = e.touches[0]
    const dx = t.clientX - pointer.sx
    const dy = t.clientY - pointer.sy
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (Math.max(ax, ay) < 18) return
    const key = ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    pointer.sx = t.clientX
    pointer.sy = t.clientY
    requestTurn(key)
  }
  const onTouchEnd = () => {
    pointer.active = false
  }
  return { onTouchStart, onTouchMove, onTouchEnd }
}

// A tiny touch-screen model. fingers: id -> { x, y, onCanvas }
function screen(handlers) {
  const fingers = new Map()
  const list = () => [...fingers.entries()].map(([id, f]) => ({ identifier: id, clientX: f.x, clientY: f.y, onCanvas: f.onCanvas }))
  const ev = (id) => {
    const all = list()
    return { touches: all, targetTouches: all.filter((t) => t.onCanvas), changedTouches: all.filter((t) => t.identifier === id), preventDefault() {} }
  }
  return {
    down(id, x, y, onCanvas = true) {
      fingers.set(id, { x, y, onCanvas })
      if (onCanvas) handlers.onTouchStart(ev(id))
    },
    move(id, x, y) {
      const f = fingers.get(id)
      f.x = x
      f.y = y
      if (f.onCanvas) handlers.onTouchMove(ev(id))
    },
    up(id) {
      const f = fingers.get(id)
      const e = ev(id)
      fingers.delete(id)
      if (f.onCanvas) handlers.onTouchEnd({ ...e, touches: list() })
    },
  }
}

// Move a finger along a polyline in 4px steps (a 120Hz touch digitiser at ~500px/s).
function drag(s, id, pts) {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1]
    const [x1, y1] = pts[k]
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4))
    for (let i = 1; i <= n; i++) s.move(id, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)
  }
}

const DASH = [300, 780] // the Dash button at 390x844 (bottom-right cluster)
export const SCENARIOS = [
  { id: 'S1', name: 'straight swipe up 60px', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 340]]); s.up(1) } },
  { id: 'S2', name: 'tap with 8px jitter', expect: [], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [156, 405]]); s.up(1) } },
  { id: 'S3', name: 'flick up 40px that curls 30px right at the end', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [152, 370], [160, 356], [182, 350]]); s.up(1) } },
  { id: 'S4', name: 'L-swipe: up 50px then right 50px (two turns intended)', expect: ['up', 'right'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 350], [200, 350]]); s.up(1) } },
  { id: 'S5', name: 'diagonal-ish swipe 24px right / 22px up', expect: ['up|right'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [174, 378]]); s.up(1) } },
  { id: 'S6', name: 'Dash held (thumb 1) + swipe up 60px (thumb 2)', expect: ['up'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 340]]); s.up(1); s.up(9) } },
  { id: 'S7', name: 'Dash held + swipe left 60px', expect: ['left'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 200, 400); drag(s, 1, [[200, 400], [140, 400]]); s.up(1); s.up(9) } },
  { id: 'S8', name: 'swipe right starts, Dash released mid-swipe, finger moves 4px more', expect: ['right'], play: (s) => { s.down(9, ...DASH, false); s.down(1, 100, 400); drag(s, 1, [[100, 400], [124, 400]]); s.up(9); drag(s, 1, [[124, 400], [128, 400]]); s.up(1) } },
  { id: 'S9', name: 'second finger lands on the lake while first swipes up', expect: ['up'], play: (s) => { s.down(1, 150, 400); drag(s, 1, [[150, 400], [150, 370]]); s.down(2, 250, 300); drag(s, 1, [[150, 370], [150, 350]]); s.up(2); s.up(1) } },
]

export function runScenarios(factory) {
  return SCENARIOS.map((sc) => {
    const got = []
    // A repeat of the same key is always rejected by turn() (d === refDir),
    // so consecutive duplicates are collapsed: only distinct requests count.
    const h = factory((k) => { if (got[got.length - 1] !== k) got.push(k) })
    sc.play(screen(h))
    const ok = got.length === sc.expect.length && sc.expect.every((e, i) => e.split('|').includes(got[i]))
    return { id: sc.id, name: sc.name, expect: sc.expect.join(','), got: got.join(',') || '—', ok }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // --reference: replay the same traces through the C02 reference tracker
  // (docs/plan/polish/reference/swipeTracker.js) instead of master's handlers.
  const ref = process.argv.includes('--reference')
  const factory = ref ? (await import('../reference/swipeTracker.js')).referenceSwipe : engineSwipe
  console.log(ref ? 'handlers: REFERENCE swipeTracker (C02)' : 'handlers: master engine.js @ f9d1dd6 (copy)')
  const res = runScenarios(factory)
  for (const r of res) console.log(`${r.id} ${r.ok ? 'OK  ' : 'FAIL'} expect [${r.expect}] got [${r.got}]  ${r.name}`)
  console.log(`swipe scenarios ok: ${res.filter((r) => r.ok).length}/${res.length}`)
  const at = process.argv.indexOf('--json')
  if (at > 0) fs.writeFileSync(process.argv[at + 1], JSON.stringify(res, null, 1))
}
