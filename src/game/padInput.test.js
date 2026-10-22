import { describe, it, expect } from 'vitest'
import { padDirection } from './padInput.js'

describe('padDirection (C03)', () => {
  it('the centre dead zone (±15px on either axis) steers nothing', () => {
    expect(padDirection(0, 0)).toBe(null)
    expect(padDirection(15, 15)).toBe(null)
    expect(padDirection(-15, 15)).toBe(null)
    expect(padDirection(15, -15)).toBe(null)
    expect(padDirection(-15, -15)).toBe(null)
    expect(padDirection(0, -15)).toBe(null)
  })

  it('the dominant axis wins', () => {
    expect(padDirection(60, 10)).toBe('right')
    expect(padDirection(-10, -60)).toBe('up')
    expect(padDirection(-60, -10)).toBe('left')
    expect(padDirection(10, 60)).toBe('down')
  })

  it('a near-diagonal still picks the larger axis', () => {
    expect(padDirection(40, 39)).toBe('right')
    expect(padDirection(-39, -40)).toBe('up')
  })

  it('a finger sliding around the pad emits each new direction once, in order', () => {
    // Offsets along a slide: up the middle, across to the right, down.
    const pts = [
      [0, -20], [0, -40], // up
      [18, -38], [40, -30], [44, -4], // swinging right ((18,-38) is still vertical-dominant, so it stays up)
      [38, 20], [10, 42], [0, 44], // down
    ]
    const seq = []
    for (const [dx, dy] of pts) {
      const d = padDirection(dx, dy)
      if (d && d !== seq[seq.length - 1]) seq.push(d)
    }
    expect(seq).toEqual(['up', 'right', 'down'])
  })

  it('leaving and re-entering the same quadrant does not repeat it', () => {
    const pts = [[0, -40], [4, -4], [0, -44]] // up, dead zone, up again
    const seq = []
    let last = null
    for (const [dx, dy] of pts) {
      const d = padDirection(dx, dy)
      if (d && d !== last) {
        seq.push(d)
        last = d
      }
    }
    expect(seq).toEqual(['up'])
  })
})
