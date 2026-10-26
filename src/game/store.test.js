import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGame, readOnboarded } from './store.js'
import { coachBlocksCamera } from '../three/cameraFit.js'

// Snapshot of the pristine state (fresh profile, empty localStorage stub
// from test/setup.js). Restored before every test for isolation.
const initialState = useGame.getState()

beforeEach(() => {
  vi.useFakeTimers() // keeps enterPlaying's coach-mark timeout from firing
  localStorage.clear()
  useGame.setState(initialState, true)
})

describe('run lifecycle transitions', () => {
  it('walks title -> prologue -> ready -> playing', () => {
    expect(useGame.getState().status).toBe('title')
    useGame.getState().start()
    expect(useGame.getState().status).toBe('prologue')
    useGame.getState().beginNight()
    expect(useGame.getState().status).toBe('ready')
    useGame.getState().enterPlaying()
    expect(useGame.getState().status).toBe('playing')
  })

  it('guards transitions against the wrong state', () => {
    useGame.getState().beginNight() // not in prologue: no-op
    expect(useGame.getState().status).toBe('title')
    useGame.getState().start()
    useGame.getState().enterPlaying() // not in ready: no-op
    expect(useGame.getState().status).toBe('prologue')
  })
})

describe('unlock routing', () => {
  it('ferries night-start unlocks into the prologue queue on start()', () => {
    useGame.getState().start()
    const s = useGame.getState()
    expect(s.status).toBe('prologue')
    // A fresh profile's first night always unlocks the 'night-1' whisper.
    expect(s.prologueQueue.map((q) => q.id)).toContain('night-1')
    expect(s.whisperToasts).toEqual([])
    expect(s.verseToasts).toEqual([])
    expect(s.runUnlocks).toEqual([])
  })

  it('routes a mid-run unlock into runUnlocks while playing', () => {
    useGame.getState().start()
    useGame.getState().beginNight()
    useGame.getState().enterPlaying()
    expect(useGame.getState().status).toBe('playing')
    // 'score-25' whisper: fires on an eat with score >= 25.
    useGame.setState({ score: 25 })
    useGame.getState().registerEat({})
    const unlocks = useGame.getState().runUnlocks
    expect(unlocks.some((u) => u.kind === 'whisper' && u.id === 'score-25')).toBe(true)
  })

  it('clears runUnlocks when a new night starts', () => {
    useGame.getState().start()
    useGame.getState().beginNight()
    useGame.getState().enterPlaying()
    useGame.setState({ score: 25 })
    useGame.getState().registerEat({})
    expect(useGame.getState().runUnlocks.length).toBeGreaterThan(0)
    useGame.getState().start()
    expect(useGame.getState().status).toBe('prologue')
    expect(useGame.getState().runUnlocks).toEqual([])
  })

  it('routes a title-screen unlock into pendingUnlocks and persists it (T10b)', () => {
    expect(useGame.getState().status).toBe('title')
    // 'verse-garden-awakens' fires on the 'garden' event — what Garden
    // purchases call while the player is on the title screen.
    useGame.getState().checkVerses('garden')
    const s = useGame.getState()
    expect(s.runUnlocks).toEqual([])
    expect(s.pendingUnlocks).toHaveLength(1)
    expect(s.pendingUnlocks[0]).toMatchObject({ kind: 'verse', id: 'verse-garden-awakens' })
    const stored = JSON.parse(localStorage.getItem('ran-xinh-pending-unlocks'))
    expect(stored.map((p) => p.id)).toEqual(['verse-garden-awakens'])
    // A repeat evaluation never duplicates the pending entry.
    useGame.getState().checkVerses('garden')
    expect(useGame.getState().pendingUnlocks).toHaveLength(1)
  })

  it('start() leads the prologue queue with pendingUnlocks, then clears them (T10b)', () => {
    useGame.getState().checkVerses('garden')
    useGame.getState().start()
    const s = useGame.getState()
    expect(s.status).toBe('prologue')
    expect(s.prologueQueue[0].id).toBe('verse-garden-awakens')
    expect(s.pendingUnlocks).toEqual([])
    expect(localStorage.getItem('ran-xinh-pending-unlocks')).toBeNull()
  })

  it('pendingUnlocks survive a reload via hydrate() (T10b)', () => {
    useGame.getState().checkVerses('garden')
    // Simulate a reload: back to the pristine state, localStorage kept,
    // then hydrate() the way the app boots.
    useGame.setState(initialState, true)
    expect(useGame.getState().pendingUnlocks).toEqual([])
    useGame.getState().hydrate()
    expect(useGame.getState().pendingUnlocks.map((p) => p.id)).toEqual(['verse-garden-awakens'])
    useGame.getState().start()
    expect(useGame.getState().prologueQueue[0].id).toBe('verse-garden-awakens')
  })

  it('runUnlocks is never capped: a rich run keeps every unlock (T10b)', () => {
    useGame.getState().start()
    useGame.getState().beginNight()
    useGame.getState().enterPlaying()
    // A stacked context so one eat evaluation unlocks many poems at
    // once, across both whispers and verses — more than the old cap of 8.
    useGame.setState({
      score: 100,
      length: 14,
      totals: { supernovas: 6, planets: 60, deaths: 4, spiritCatches: 3, zenSessions: 2, lanternFeasts: 2 },
      nightStats: { supernovas: 3, planets: 40, boostEats: 6 },
    })
    useGame.getState().registerEat({ bloom: true })
    useGame.getState().registerEat({})
    const unlocks = useGame.getState().runUnlocks
    // Exactly 10 for this context (measured): supernova-first, score-25,
    // score-50, score-100, verse-hundred-lights, verse-half-moon-true,
    // verse-supernova-three, verse-spirit-thrice, eat-10-night,
    // verse-dash-dancer. The old .slice(-8) would have dropped 2.
    expect(unlocks).toHaveLength(10)
    expect(new Set(unlocks.map((u) => u.id)).size).toBe(unlocks.length)
  })
})

describe('coach marks', () => {
  it('pausing mid-delay then resuming restores the remaining coach delay', () => {
    // Night 1, fresh profile (onboarded key absent): enterPlaying arms it.
    useGame.setState({ status: 'ready', night: 1, coachStep: -1 })
    useGame.getState().enterPlaying()
    expect(useGame.getState().status).toBe('playing')
    vi.advanceTimersByTime(1000) // 1s into the 2s delay
    useGame.getState().pause()
    vi.advanceTimersByTime(500) // resumed before the delay would have fired
    expect(useGame.getState().coachStep).toBe(-1)
    useGame.getState().resume()
    vi.advanceTimersByTime(499) // just under the restored ~1s remainder
    expect(useGame.getState().coachStep).toBe(-1)
    vi.advanceTimersByTime(1) // the restored remainder elapses
    expect(useGame.getState().coachStep).toBe(0)
  })
})

describe('serpent skins (S04)', () => {
  it('hydrates to the default skin on an empty profile', () => {
    useGame.getState().hydrate()
    expect(useGame.getState().skins).toEqual({ owned: ['moonJade'], selected: 'moonJade' })
  })

  it('hydrates through corrupt JSON by falling back to defaults', () => {
    localStorage.setItem('ran-xinh-skin', '{not json')
    useGame.getState().hydrate()
    expect(useGame.getState().skins).toEqual({ owned: ['moonJade'], selected: 'moonJade' })
  })

  it('filters unknown owned ids and keeps a valid owned selection', () => {
    localStorage.setItem('ran-xinh-skin', JSON.stringify({ owned: ['plushMoon', 'bogus'], selected: 'plushMoon' }))
    useGame.getState().hydrate()
    expect(useGame.getState().skins.owned).toEqual(['moonJade', 'plushMoon'])
    expect(useGame.getState().skins.selected).toBe('plushMoon')
  })

  it('falls back when the saved selection is not owned', () => {
    localStorage.setItem('ran-xinh-skin', JSON.stringify({ owned: ['moonJade'], selected: 'plushMoon' }))
    useGame.getState().hydrate()
    expect(useGame.getState().skins.selected).toBe('moonJade')
  })

  it('chooseSkin refuses unowned and unknown skins without persisting', () => {
    useGame.getState().chooseSkin('plushMoon') // not owned yet (unlocks land in S06)
    expect(useGame.getState().skins.selected).toBe('moonJade')
    useGame.getState().chooseSkin('bogus')
    expect(useGame.getState().skins.selected).toBe('moonJade')
    expect(localStorage.getItem('ran-xinh-skin')).toBeNull()
  })

  it('chooseSkin wears an owned skin and persists under ran-xinh-skin', () => {
    localStorage.setItem('ran-xinh-skin', JSON.stringify({ owned: ['plushMoon'], selected: 'moonJade' }))
    useGame.getState().hydrate()
    useGame.getState().chooseSkin('plushMoon')
    expect(useGame.getState().skins.selected).toBe('plushMoon')
    expect(JSON.parse(localStorage.getItem('ran-xinh-skin'))).toEqual({
      owned: ['moonJade', 'plushMoon'],
      selected: 'plushMoon',
    })
  })
})

describe('buySkin and milestone grants (S06)', () => {
  it('buySkin with 800 moonlight buys plushMoon, wears it and persists both', () => {
    useGame.setState({ moonlight: { balance: 800, earned: 800 } })
    useGame.getState().buySkin('plushMoon')
    const s = useGame.getState()
    expect(s.moonlight.balance).toBe(0)
    expect(s.skins.owned).toContain('plushMoon')
    expect(s.skins.selected).toBe('plushMoon')
    expect(JSON.parse(localStorage.getItem('ran-xinh-skin')).selected).toBe('plushMoon')
    expect(JSON.parse(localStorage.getItem('ran-xinh-moonlight')).balance).toBe(0)
  })

  it('buySkin refuses at 799 and for unknown ids, without touching the balance', () => {
    useGame.setState({ moonlight: { balance: 799, earned: 799 } })
    useGame.getState().buySkin('plushMoon')
    expect(useGame.getState().skins.owned).not.toContain('plushMoon')
    expect(useGame.getState().moonlight.balance).toBe(799)
    useGame.setState({ moonlight: { balance: 5000, earned: 5000 } })
    useGame.getState().buySkin('bogus')
    expect(useGame.getState().moonlight.balance).toBe(5000)
    expect(useGame.getState().skins.selected).toBe('moonJade')
  })

  it('buySkin on an owned skin wears it without charging', () => {
    localStorage.setItem('ran-xinh-skin', JSON.stringify({ owned: ['plushMoon'], selected: 'moonJade' }))
    useGame.getState().hydrate()
    useGame.setState({ moonlight: { balance: 300, earned: 300 } })
    useGame.getState().buySkin('plushMoon')
    expect(useGame.getState().moonlight.balance).toBe(300)
    expect(useGame.getState().skins.selected).toBe('plushMoon')
  })

  it('completing a Moonrise Night grants plushMoon free and announces it in runUnlocks', () => {
    useGame.setState({ status: 'playing', moonriseActive: true, gameMode: 'classic' })
    useGame.getState().gameOver({ score: 12, length: 9, cause: 'wall' })
    const s = useGame.getState()
    expect(s.journey.completed).toBe(1)
    expect(s.skins.owned).toContain('plushMoon')
    expect(s.skins.selected).toBe('moonJade') // granted, not auto-worn
    expect(s.runUnlocks.some((u) => u.kind === 'skin' && u.id === 'plushMoon')).toBe(true)
    expect(JSON.parse(localStorage.getItem('ran-xinh-skin')).owned).toContain('plushMoon')
  })

  it('a normal night grants nothing', () => {
    useGame.setState({ status: 'playing', moonriseActive: false, gameMode: 'classic' })
    useGame.getState().gameOver({ score: 12, length: 9, cause: 'wall' })
    const s = useGame.getState()
    expect(s.skins.owned).not.toContain('plushMoon')
    expect(s.runUnlocks.some((u) => u.kind === 'skin')).toBe(false)
  })

  it('hydrate grants the milestone skin to a player who finished a Moonrise before S06', () => {
    localStorage.setItem('ran-xinh-journey', JSON.stringify({ progress: 0, completed: 2 }))
    useGame.getState().hydrate()
    expect(useGame.getState().skins.owned).toContain('plushMoon')
    expect(JSON.parse(localStorage.getItem('ran-xinh-skin')).owned).toContain('plushMoon')
  })
})

// V03 fix round 3 (owner review): the first-night camera hold must be
// read off the REAL store journey, not hand-fed nights. A fresh profile
// starts at night 0 (readNight() on empty storage) and only becomes 1
// in start() — the round-2 chain test fed night 1 for title and missed
// the title→prologue tilt on a real first run.
describe('V03 first-night camera hold on real store state', () => {
  it('fresh profile: title (night 0) through coach dismiss changes exactly once', () => {
    const held = []
    const snap = () => {
      const s = useGame.getState()
      held.push(
        coachBlocksCamera({ coachStep: s.coachStep, night: s.night, onboarded: readOnboarded() }),
      )
    }
    // beforeEach restored the pristine profile: title, night 0, no coach.
    expect(useGame.getState().status).toBe('title')
    expect(useGame.getState().night).toBe(0)
    snap() // title, night 0
    useGame.getState().start() // prologue, night 1
    expect(useGame.getState().night).toBe(1)
    snap()
    useGame.getState().beginNight() // ready
    snap()
    useGame.getState().enterPlaying() // playing; coach timer armed (fake timers hold it)
    snap()
    // The timer would set coachStep 0; steps advance through the real actions.
    useGame.setState({ coachStep: 0 })
    snap()
    useGame.getState().advanceCoach() // 0 -> 1
    snap()
    useGame.getState().advanceCoach() // 1 -> 2
    snap()
    useGame.getState().advanceCoach() // 2 -> dismissCoach: writes onboarded, coachStep -1
    snap()
    expect(useGame.getState().coachStep).toBe(-1)
    expect(readOnboarded()).toBe(true)
    expect(held).toEqual([true, true, true, true, true, true, true, false])
    const changes = held.slice(1).filter((v, i) => v !== held[i]).length
    expect(changes).toBe(1)
  })
})

describe('music toggle + volume (M02)', () => {
  it('defaults to on at 0.6 on a fresh profile', () => {
    expect(useGame.getState().music).toEqual({ on: true, volume: 0.6 })
  })

  it('reads persisted music, and falls back per-field on bad JSON', () => {
    localStorage.setItem('ran-xinh-music', JSON.stringify({ on: false, volume: 0.8 }))
    useGame.getState().hydrate()
    expect(useGame.getState().music).toEqual({ on: false, volume: 0.8 })
    localStorage.setItem('ran-xinh-music', '{not json')
    useGame.getState().hydrate()
    expect(useGame.getState().music).toEqual({ on: true, volume: 0.6 })
    localStorage.setItem('ran-xinh-music', JSON.stringify({ on: 'yes', volume: 2 }))
    useGame.getState().hydrate()
    expect(useGame.getState().music).toEqual({ on: true, volume: 1 })
  })

  it('setMusicOn/Volume write the key, clamped and rounded to 0.1', () => {
    const s = useGame.getState()
    s.setMusicOn(false)
    expect(useGame.getState().music.on).toBe(false)
    expect(JSON.parse(localStorage.getItem('ran-xinh-music')).on).toBe(false)
    s.setMusicVolume(0.63)
    expect(useGame.getState().music.volume).toBe(0.6)
    s.setMusicVolume(1.7)
    expect(useGame.getState().music.volume).toBe(1)
    s.setMusicVolume(-0.4)
    expect(useGame.getState().music.volume).toBe(0)
    expect(JSON.parse(localStorage.getItem('ran-xinh-music')).volume).toBe(0)
  })

  it('reload keeps the persisted music (hydrate re-reads the key)', () => {
    useGame.getState().setMusicOn(false)
    useGame.getState().setMusicVolume(0.4)
    useGame.setState(initialState, true) // simulate a reload: pristine state, storage kept
    expect(useGame.getState().music).toEqual({ on: true, volume: 0.6 })
    useGame.getState().hydrate()
    expect(useGame.getState().music).toEqual({ on: false, volume: 0.4 })
  })
})
