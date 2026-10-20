import { describe, it, expect, vi, afterEach } from 'vitest'
import { __test__ } from './sound.js'

// Minimal mock AudioContext: records every oscillator start time so a
// test can see exactly what one planning pass scheduled. Gain/filter
// nodes are inert stubs — the scheduler only connects through them.
function fakeAudioContext(now) {
  const starts = []
  return {
    currentTime: now,
    starts,
    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        connect() {},
        start(at) {
          starts.push(at)
        },
        stop() {},
      }
    },
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
        },
        connect() {},
        disconnect() {},
      }
    },
    createBiquadFilter() {
      return {
        type: '',
        frequency: { value: 0, setTargetAtTime() {} },
        connect() {},
        disconnect() {},
      }
    },
  }
}

describe('ambient phrase scheduler (planPhrases)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops overdue phrases after a long tab-hidden gap instead of bursting', () => {
    // Deterministic randomness: every phrase plays, 2 notes per phrase.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const now = 1000
    const fake = fakeAudioContext(now)
    // A throttled background tab: the next phrase fell due 60s ago while
    // the audio clock kept running.
    __test__.mockAmbient(fake, { nextAt: now - 60 })
    __test__.planPhrases()
    // Only what fits the 2s horizon may be scheduled: one phrase
    // (2 notes x 2 oscillators = 4 starts) — not the ~14 overdue phrases
    // the unclamped loop would have dumped into the past.
    expect(fake.starts.length).toBeLessThanOrEqual(8)
    // Nothing sounds in the past; the schedule resumes from now.
    expect(Math.min(...fake.starts)).toBeGreaterThanOrEqual(now + 0.1 - 1e-9)
    expect(__test__.nextPhraseAt()).toBeGreaterThan(now)
  })

  it('plans at most one phrase per pass in normal operation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const now = 500
    const fake = fakeAudioContext(now)
    __test__.mockAmbient(fake, { nextAt: now + 0.5 })
    __test__.planPhrases()
    expect(fake.starts.length).toBe(4) // one phrase, two notes, two oscillators each
    expect(__test__.nextPhraseAt()).toBeGreaterThan(now + 2.0) // pushed past the horizon
  })

  it('does nothing while the ambient score is off', () => {
    const fake = fakeAudioContext(100)
    __test__.mockAmbient(fake, { on: false, nextAt: 0 })
    __test__.planPhrases()
    expect(fake.starts).toEqual([])
  })
})
