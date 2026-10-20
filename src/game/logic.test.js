import { describe, it, expect } from 'vitest'
import {
  createGame,
  turn,
  step,
  speedInterval,
  isOpposite,
  DIR,
  MAX_QUEUE,
  BASE_INTERVAL,
  MIN_INTERVAL,
  SPEED_STEP_EVERY,
  SPEED_DECAY,
  BOOST_MULTIPLIER,
} from './logic.js'

// A fresh classic game starts at the centre of the 20x20 board heading
// right, length 3. Food is nulled in most tests so steering is isolated
// from random food placement.
function freshGame(mode = 'classic') {
  const g = createGame('half', mode)
  g.food = null
  return g
}

describe('turn()', () => {
  it('rejects reversing into the neck', () => {
    const g = freshGame()
    expect(turn(g, 'left')).toBe(false)
    expect(g.queue).toEqual([])
  })

  it('rejects repeating the current direction', () => {
    const g = freshGame()
    expect(turn(g, 'right')).toBe(false)
    expect(g.queue).toEqual([])
  })

  it('rejects unknown direction keys', () => {
    const g = freshGame()
    expect(turn(g, 'north')).toBe(false)
    expect(turn(g, 'KeyW')).toBe(false) // keyboard code, not a direction name
    expect(turn(g, '')).toBe(false)
    expect(turn(g, undefined)).toBe(false)
    expect(g.queue).toEqual([])
  })

  it('queues turns and validates each against the turn it follows', () => {
    const g = freshGame()
    expect(turn(g, 'up')).toBe(true)
    expect(turn(g, 'down')).toBe(false) // opposite of the queued 'up'
    expect(turn(g, 'left')).toBe(true)
    expect(turn(g, 'down')).toBe(true) // perpendicular to 'left'
    expect(g.queue).toEqual(['up', 'left', 'down'])
  })

  it('never holds more than MAX_QUEUE turns', () => {
    const g = freshGame()
    turn(g, 'up')
    turn(g, 'left')
    turn(g, 'down')
    expect(g.queue.length).toBe(MAX_QUEUE)
    turn(g, 'up')
    turn(g, 'left')
    expect(g.queue.length).toBe(MAX_QUEUE)
  })

  it('when full, replaces only the last turn, validated against the one before it', () => {
    const g = freshGame()
    turn(g, 'up')
    turn(g, 'left')
    turn(g, 'down')
    expect(g.queue).toEqual(['up', 'left', 'down'])
    // Full: the reference becomes 'left' (the turn before the last one).
    expect(turn(g, 'right')).toBe(false) // opposite of 'left'
    expect(turn(g, 'left')).toBe(false) // same as the reference
    expect(turn(g, 'down')).toBe(false) // re-tap of the last queued turn
    expect(turn(g, 'up')).toBe(true) // revises the latest intent
    expect(g.queue).toEqual(['up', 'left', 'up'])
  })
})

describe('step()', () => {
  it('consumes the queue one turn per step, in order', () => {
    const g = freshGame()
    turn(g, 'up')
    turn(g, 'left')
    const r1 = step(g)
    expect(r1.dead).toBe(false)
    expect(g.dir).toBe('up')
    expect(g.snake[0]).toEqual({ x: 10, y: 9 })
    expect(g.queue).toEqual(['left'])
    const r2 = step(g)
    expect(r2.dead).toBe(false)
    expect(g.dir).toBe('left')
    expect(g.snake[0]).toEqual({ x: 9, y: 9 })
    expect(g.queue).toEqual([])
  })

  it('dies on a wall in classic mode', () => {
    const g = freshGame()
    for (let i = 0; i < 9; i += 1) {
      expect(step(g).dead).toBe(false)
    }
    expect(g.snake[0]).toEqual({ x: 19, y: 10 })
    const r = step(g)
    expect(r).toEqual({ dead: true, cause: 'wall' })
    expect(g.alive).toBe(false)
  })

  it('wraps around the edges in zen mode instead of dying', () => {
    const g = freshGame('zen')
    for (let i = 0; i < 9; i += 1) step(g)
    expect(g.snake[0].x).toBe(19)
    const r = step(g)
    expect(r.dead).toBe(false)
    expect(g.alive).toBe(true)
    expect(g.snake[0].x).toBe(0) // wrapped
  })

  it('ends a lantern run when the clock runs out', () => {
    const g = createGame('half', 'lantern')
    expect(g.timeLeft).toBe(60)
    const r1 = step(g, 30)
    expect(r1.dead).toBe(false)
    expect(g.timeLeft).toBe(30)
    const r2 = step(g, 31)
    expect(r2).toEqual({ dead: true, cause: 'time' })
    expect(g.timeLeft).toBe(0)
    expect(g.alive).toBe(false)
  })

  it('never applies a reversal and never self-bites from queued turns (seeded fuzz)', () => {
    // Deterministic PRNG so the fuzz is reproducible.
    function mulberry32(seed) {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    const rand = mulberry32(0x5eed)
    const keys = ['up', 'down', 'left', 'right']
    let totalSteps = 0
    for (let gameIdx = 0; gameIdx < 1000; gameIdx += 1) {
      const g = freshGame()
      for (let s = 0; s < 80; s += 1) {
        const prevDir = g.dir
        const bursts = (rand() * 4) | 0
        for (let b = 0; b < bursts; b += 1) {
          turn(g, keys[(rand() * 4) | 0])
        }
        expect(g.queue.length).toBeLessThanOrEqual(MAX_QUEUE)
        const r = step(g)
        totalSteps += 1
        if (r.dead) {
          // Running into a wall is legal; biting itself from a queued
          // reversal is the bug this guards against.
          expect(r.cause).not.toBe('self')
          break
        }
        expect(isOpposite(DIR[g.dir], DIR[prevDir])).toBe(false)
      }
    }
    expect(totalSteps).toBeGreaterThan(10000)
  })
})

describe('speedInterval()', () => {
  it('starts at BASE_INTERVAL', () => {
    expect(speedInterval(0)).toBeCloseTo(BASE_INTERVAL, 10)
    expect(speedInterval(SPEED_STEP_EVERY - 1)).toBeCloseTo(BASE_INTERVAL, 10)
  })

  it('decays by SPEED_DECAY every SPEED_STEP_EVERY foods', () => {
    expect(speedInterval(SPEED_STEP_EVERY)).toBeCloseTo(BASE_INTERVAL * SPEED_DECAY, 10)
    expect(speedInterval(2 * SPEED_STEP_EVERY)).toBeCloseTo(BASE_INTERVAL * SPEED_DECAY ** 2, 10)
  })

  it('clamps at MIN_INTERVAL before multipliers are applied', () => {
    expect(speedInterval(100000)).toBe(MIN_INTERVAL)
    // Boost multiplies the already-clamped value, so it can go below the cap.
    expect(speedInterval(100000, true)).toBeCloseTo(MIN_INTERVAL * BOOST_MULTIPLIER, 10)
    expect(speedInterval(100000, true)).toBeLessThan(MIN_INTERVAL)
  })

  it('boost multiplies the interval by BOOST_MULTIPLIER', () => {
    expect(speedInterval(0, true)).toBeCloseTo(BASE_INTERVAL * BOOST_MULTIPLIER, 10)
  })
})
