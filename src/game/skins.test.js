import { describe, it, expect } from 'vitest'
import { SKINS, SKIN_IDS, DEFAULT_SKIN, skinById, isDefaultSkin } from './skins.js'

// S04 acceptance: registry sanity — unique ids, the default is a
// real skin, unknown ids resolve to the default, and the settled
// unlock declarations are in place for S06 to evaluate.
describe('skin registry (S04)', () => {
  it('has unique ids and DEFAULT_SKIN is one of them', () => {
    expect(new Set(SKIN_IDS).size).toBe(SKIN_IDS.length)
    expect(SKIN_IDS).toContain(DEFAULT_SKIN)
    expect(SKIN_IDS).toEqual(['moonJade', 'plushMoon'])
  })

  it('skinById resolves known ids and falls back to the default', () => {
    expect(skinById('plushMoon').id).toBe('plushMoon')
    expect(skinById('moonJade').id).toBe('moonJade')
    expect(skinById('bogus').id).toBe(DEFAULT_SKIN)
    expect(skinById(undefined).id).toBe(DEFAULT_SKIN)
  })

  it('every skin carries the full picker + unlock data', () => {
    for (const skin of SKINS) {
      expect(skin.name).toBeTruthy()
      expect(skin.nameVi).toBeTruthy()
      expect(skin.desc).toBeTruthy()
      expect(skin.swatch).toBeTruthy()
      expect(skin.accent).toBeTruthy()
      expect(Array.isArray(skin.unlock)).toBe(true)
      expect(skin.unlock.length).toBeGreaterThan(0)
    }
  })

  it('declares the settled unlock rules (S06 evaluates them)', () => {
    expect(isDefaultSkin(skinById('moonJade'))).toBe(true)
    expect(isDefaultSkin(skinById('plushMoon'))).toBe(false)
    // Plush Moon: 800 moonlight in the Garden OR a completed
    // Moonrise Night, whichever comes first.
    expect(skinById('plushMoon').unlock).toEqual([
      { type: 'moonlight', cost: 800 },
      { type: 'moonrise' },
    ])
  })
})
