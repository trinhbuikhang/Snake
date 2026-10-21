import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGame } from './store.js'

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
