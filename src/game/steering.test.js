// Steering lock (POLISH_PLAN C01): the high-speed steering behaviour the
// game already has, pinned by tests that drive the REAL tick loop
// (runTicks from three/tickClock.js — the same function engine.js calls)
// plus the real createGame/turn/step/speedInterval. Mirrors the session
// model of docs/plan/polish/tooling/steer-sim.mjs: inputs are delivered
// before the frame that follows them, the interval is fixed per speed,
// food is parked in a corner and the snake starts with room to run right.
import { describe, it, expect } from 'vitest'
import { createGame, turn, step, speedInterval } from './logic.js'
import { runTicks } from '../three/tickClock.js'

// Same four speeds as the simulator: run start, the speed floor, Dash at
// the floor, and the fastest legal combo (multipliers × Dash).
const SPEEDS = {
  base: speedInterval(0, false),
  floor: speedInterval(999, false),
  dash: speedInterval(999, true),
  worst: speedInterval(999, true, 1.15, 1.05, 1.12),
}
const FPS = [30, 60, 120]
const GAPS_MS = [0, 8, 16, 33, 50]
const PAIRS = [
  ['up', 'left'],
  ['up', 'right'],
]

// Deterministic LCG (same family as the simulator's seeded RNG).
function lcg(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function freshGame() {
  const g = createGame('half', 'classic')
  g.food = { x: 0, y: 0 } // keep food out of the way
  g.snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }] // room to run right
  return g
}

// One scripted session through runTicks. Returns the steps taken
// ({ t = tick boundary time, frameT = frame that painted it, dir }),
// the accepted inputs, and whether the snake died.
function runSession({ interval, fps, inputs, duration }) {
  const g = freshGame()
  const dt = 1 / fps
  const clock = { accum: 0, interval }
  const steps = []
  const accepted = []
  let now = 0
  let k = 0
  let dead = false
  const stepCb = (tickDt, clk) => {
    const ev = step(g, tickDt)
    if (ev.dead) {
      dead = true
      return { dead: true, nextInterval: interval }
    }
    steps.push({ t: now - (clk.accum - tickDt), frameT: now, dir: g.dir })
    return { dead: false, nextInterval: interval }
  }
  while (now < duration) {
    now += dt
    while (k < inputs.length && inputs[k].at <= now) {
      if (turn(g, inputs[k].key)) accepted.push({ ...inputs[k], stepIdx: steps.length })
      k++
    }
    runTicks(clock, dt, stepCb)
    if (dead) break
  }
  return { steps, accepted, dead }
}

describe('quick double turns at speed (C01)', () => {
  it('no turn is dropped and the snake never dies (4 speeds × 3 fps × 2 pairs × 5 gaps × 50)', () => {
    const rnd = lcg(0x5eed)
    for (const [sp, iv] of Object.entries(SPEEDS)) {
      for (const fps of FPS) {
        for (const pair of PAIRS) {
          for (const gap of GAPS_MS) {
            for (let i = 0; i < 50; i++) {
              const t0 = (2 + rnd()) * iv
              const r = runSession({
                interval: iv,
                fps,
                inputs: [
                  { at: t0, key: pair[0] },
                  { at: t0 + gap / 1000, key: pair[1] },
                ],
                duration: t0 + gap / 1000 + 4 * iv + 1 / fps,
              })
              const where = `${sp} ${fps}fps ${pair.join('>')} gap=${gap}ms trial=${i}`
              expect(r.dead, where).toBe(false)
              const from = r.accepted.length ? r.accepted[0].stepIdx : r.steps.length
              const dirs = r.steps.slice(from).map((s) => s.dir)
              const a = dirs.indexOf(pair[0])
              expect(a, where).toBeGreaterThanOrEqual(0)
              expect(dirs.indexOf(pair[1], a + 1), where).toBeGreaterThan(a)
            }
          }
        }
      }
    }
  })
})

describe('single-turn latency (C01)', () => {
  it('the applying tick lands ≤ 1.0 tick after the input; the first painted frame ≤ 1 tick + 1 frame', () => {
    const rnd = lcg(0x1a7e)
    for (const [sp, iv] of Object.entries(SPEEDS)) {
      for (const fps of FPS) {
        const dt = 1 / fps
        for (let i = 0; i < 50; i++) {
          const t0 = (2 + rnd()) * iv
          const r = runSession({
            interval: iv,
            fps,
            inputs: [{ at: t0, key: 'up' }],
            duration: t0 + 3 * iv + 0.1,
          })
          const where = `${sp} ${fps}fps trial=${i}`
          expect(r.dead, where).toBe(false)
          const s = r.accepted.length
            ? r.steps.slice(r.accepted[0].stepIdx).find((x) => x.dir === 'up')
            : null
          expect(s, where).toBeTruthy()
          const logicTicks = Math.max(0, s.t - t0) / iv
          const visibleSec = s.frameT - t0
          expect(logicTicks, where).toBeLessThanOrEqual(1.0 + 1e-9)
          expect(visibleSec, where).toBeLessThanOrEqual(iv + dt + 1e-9)
        }
      }
    }
  })
})

describe('turn queue rules the matrix relies on (C01)', () => {
  it('a turn opposite the LAST queued turn is rejected and changes nothing', () => {
    const g = freshGame() // moving right
    expect(turn(g, 'up')).toBe(true)
    expect(turn(g, 'down')).toBe(false) // opposite of the queued 'up'
    expect(g.queue).toEqual(['up'])
  })

  it('when the queue is full, a new turn replaces the last one — validated against the turn before it', () => {
    const g = freshGame()
    expect(turn(g, 'up')).toBe(true)
    expect(turn(g, 'left')).toBe(true) // queue full: ['up', 'left']
    expect(turn(g, 'down')).toBe(false) // would follow 'up' after replacing 'left' → suicide, rejected
    expect(g.queue).toEqual(['up', 'left'])
    expect(turn(g, 'right')).toBe(true) // legal after 'up' → replaces 'left'
    expect(g.queue).toEqual(['up', 'right'])
  })

  it('re-tapping the current or last queued direction is a no-op', () => {
    const g = freshGame()
    expect(turn(g, 'right')).toBe(false) // already heading right
    expect(turn(g, 'up')).toBe(true)
    expect(turn(g, 'up')).toBe(false)
    expect(g.queue).toEqual(['up'])
  })
})
