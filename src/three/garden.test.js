import { describe, it, expect } from 'vitest'
import { foodLightIntensity, foodVisibility } from './garden.js'

const KEYS = ['earth', 'mars', 'saturn', 'jupiter', 'neptune', 'sun']

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

// P02 review regression: prepareFoodForCompile's restore re-applies
// foodVisibility() from the CURRENT logical state (this is the exact
// function applyFoodVisibility — and therefore the restore — uses).
// The original bug restored a load-time snapshot instead: prepare ran
// while every planet was visible, hideFood landed during the async
// compile, and the restore stacked all six planets + the beacon on
// the title screen.
describe('foodVisibility (P02 review)', () => {
  it('hidden food shows nothing, whatever the active planet', () => {
    const vis = foodVisibility({ visible: false, activeKey: 'earth', keys: KEYS })
    expect(vis.beacon).toBe(false)
    expect(vis.groups).toEqual({
      earth: false, mars: false, saturn: false, jupiter: false, neptune: false, sun: false,
    })
  })

  it('shown food shows the beacon and only the active planet', () => {
    const vis = foodVisibility({ visible: true, activeKey: 'mars', keys: KEYS })
    expect(vis.beacon).toBe(true)
    expect(vis.groups).toEqual({
      earth: false, mars: true, saturn: false, jupiter: false, neptune: false, sun: false,
    })
    const sun = foodVisibility({ visible: true, activeKey: 'sun', keys: KEYS })
    expect(sun.groups.sun).toBe(true)
    expect(sun.groups.earth).toBe(false)
  })

  it('restore ordering: prepare → hideFood → restore shows nothing', () => {
    // Logical state when the restore runs: title flow hid the food.
    const atRestore = foodVisibility({ visible: false, activeKey: 'earth', keys: KEYS })
    expect(Object.values(atRestore.groups).some(Boolean)).toBe(false)
    expect(atRestore.beacon).toBe(false)
  })

  it('restore ordering: prepare → setFood(mars) → restore shows only mars', () => {
    // Logical state when the restore runs: a fast Start already
    // placed mars — the restore must not resurrect the other five.
    const atRestore = foodVisibility({ visible: true, activeKey: 'mars', keys: KEYS })
    expect(Object.entries(atRestore.groups).filter(([, v]) => v)).toEqual([['mars', true]])
    expect(atRestore.beacon).toBe(true)
  })
})
