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
})
