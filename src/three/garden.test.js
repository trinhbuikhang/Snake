import { describe, it, expect } from 'vitest'
import { foodLightIntensity } from './garden.js'

// P02: the food point light is never hidden — only its intensity
// changes. These are the exact intensities the pre-P02 setFood chain
// assigned per planet (before the moon-phase glow multiplier).
describe('foodLightIntensity (P02)', () => {
  it('returns the per-planet base intensity at glow 1', () => {
    expect(foodLightIntensity('sun', 1, true)).toBe(4.5)
    expect(foodLightIntensity('earth', 1, true)).toBe(3.2)
    expect(foodLightIntensity('mars', 1, true)).toBe(3.0)
    expect(foodLightIntensity('saturn', 1, true)).toBe(3.2)
    expect(foodLightIntensity('jupiter', 1, true)).toBe(3.2)
    expect(foodLightIntensity('neptune', 1, true)).toBe(3.2)
  })

  it('applies the moon-phase glow multiplier', () => {
    expect(foodLightIntensity('earth', 1.5, true)).toBeCloseTo(4.8)
    expect(foodLightIntensity('sun', 2, true)).toBe(9)
    expect(foodLightIntensity('mars', 0.5, true)).toBe(1.5)
  })

  it('is 0 while food is hidden, whatever the planet or glow', () => {
    expect(foodLightIntensity('sun', 2, false)).toBe(0)
    expect(foodLightIntensity('earth', 1, false)).toBe(0)
  })

  it('falls back to the earth base for unknown keys and sanitizes the glow', () => {
    expect(foodLightIntensity('pluto', 1, true)).toBe(3.2)
    expect(foodLightIntensity('earth', 0, true)).toBe(3.2)
    expect(foodLightIntensity('earth', -2, true)).toBe(3.2)
  })

  it('defaults to visible at glow 1', () => {
    expect(foodLightIntensity('mars')).toBe(3.0)
  })
})
