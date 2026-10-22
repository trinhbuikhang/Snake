import { describe, it, expect } from 'vitest'
import {
  SKINS, SKIN_IDS, DEFAULT_SKIN, skinById, isDefaultSkin,
  SKIN_UNLOCK_TYPES, skinUnlockState, checkSkinMilestones,
} from './skins.js'

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
    expect(skinById('moonJade').unlock).toEqual([{ type: 'default' }])
    expect(skinById('plushMoon').unlock).toEqual([
      { type: 'moonlight', cost: 800 },
      { type: 'milestone', id: 'first-moonrise' },
    ])
  })

  it('uses only valid unlock rule types across the whole catalogue', () => {
    for (const skin of SKINS) {
      for (const rule of skin.unlock) {
        expect(SKIN_UNLOCK_TYPES).toContain(rule.type)
        if (rule.type === 'moonlight') expect(rule.cost).toBeGreaterThan(0)
        if (rule.type === 'milestone') expect(typeof rule.id).toBe('string')
      }
    }
  })
})

describe('skin unlock evaluation (S06)', () => {
  const plush = skinById('plushMoon')
  const fresh = { owned: ['moonJade'], balance: 0, journeyCompleted: 0 }

  it('moonJade is owned by default for any player', () => {
    const st = skinUnlockState(skinById('moonJade'), fresh)
    expect(st.owned).toBe(true)
    expect(st.buyable).toBe(false)
    expect(st.cost).toBeNull()
    expect(st.reasons).toContain('default')
  })

  it('plushMoon is locked at balance 799 and buyable at 800', () => {
    const poor = skinUnlockState(plush, { ...fresh, balance: 799 })
    expect(poor).toMatchObject({ owned: false, buyable: false, cost: 800 })
    const rich = skinUnlockState(plush, { ...fresh, balance: 800 })
    expect(rich).toMatchObject({ owned: false, buyable: true, cost: 800 })
    expect(rich.reasons).toContain('moonlight')
  })

  it('an owned skin is never buyable again', () => {
    const st = skinUnlockState(plush, { owned: ['moonJade', 'plushMoon'], balance: 5000, journeyCompleted: 0 })
    expect(st.owned).toBe(true)
    expect(st.buyable).toBe(false)
  })

  it('the first-moonrise milestone grants plushMoon for free', () => {
    const st = skinUnlockState(plush, { ...fresh, journeyCompleted: 1 })
    expect(st.owned).toBe(true)
    expect(st.buyable).toBe(false)
    expect(st.reasons).toContain('milestone:first-moonrise')
  })

  it('checkSkinMilestones lists only unowned milestone grants', () => {
    expect(checkSkinMilestones(fresh)).toEqual([])
    expect(checkSkinMilestones({ ...fresh, journeyCompleted: 1 })).toEqual(['plushMoon'])
    expect(
      checkSkinMilestones({ owned: ['moonJade', 'plushMoon'], balance: 0, journeyCompleted: 3 }),
    ).toEqual([])
  })
})
