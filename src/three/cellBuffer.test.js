import { describe, it, expect } from 'vitest'
import { writeCellsInto } from './cellBuffer.js'

// Deterministic writer: cell i gets (i, 10 - i).
const write = (i, o) => {
  o.x = i
  o.z = 10 - i
}

describe('writeCellsInto()', () => {
  it('fills values and returns the same array', () => {
    const dst = []
    const out = writeCellsInto(dst, 3, write)
    expect(out).toBe(dst)
    expect(dst).toEqual([
      { x: 0, z: 10 },
      { x: 1, z: 9 },
      { x: 2, z: 8 },
    ])
  })

  it('reuses the array and its cell objects across calls (no reallocation)', () => {
    const dst = writeCellsInto([], 4, write)
    const firstCells = [...dst]
    writeCellsInto(dst, 4, (i, o) => {
      o.x = 100 + i
      o.z = i
    })
    expect(dst).toHaveLength(4)
    for (let i = 0; i < 4; i += 1) {
      expect(dst[i]).toBe(firstCells[i]) // identical objects, refilled
      expect(dst[i]).toEqual({ x: 100 + i, z: i })
    }
  })

  it('allocates only the new tail when growing', () => {
    const dst = writeCellsInto([], 2, write)
    const head = [dst[0], dst[1]]
    writeCellsInto(dst, 5, write)
    expect(dst).toHaveLength(5)
    expect(dst[0]).toBe(head[0])
    expect(dst[1]).toBe(head[1])
    expect(dst[4]).toEqual({ x: 4, z: 6 })
  })

  it('truncates when shrinking, keeping the surviving objects', () => {
    const dst = writeCellsInto([], 5, write)
    const survivor = dst[0]
    writeCellsInto(dst, 1, write)
    expect(dst).toEqual([{ x: 0, z: 10 }])
    expect(dst[0]).toBe(survivor)
  })

  it('empties the buffer at count 0', () => {
    const dst = writeCellsInto([], 3, write)
    writeCellsInto(dst, 0, write)
    expect(dst).toEqual([])
  })
})
