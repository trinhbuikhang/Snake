import { describe, it, expect } from 'vitest'
import { composeLoop, BPM, BEATS_PER_BAR, BARS, LOOP_BEATS, LOOP_SECONDS, SEC_PER_BEAT } from './lullaby.js'

// F major pentatonic pitch classes: F G A C D.
const PENTA_PC = new Set([5, 7, 9, 0, 2])
const pc = (midi) => ((midi % 12) + 12) % 12

// All notes sounding at time t (in beats), across one loop.
function sounding(notes, t) {
  return notes.filter((n) => n.t <= t && t < n.t + n.dur)
}

describe('lullaby composition (M03)', () => {
  it('spans 16 bars of 3/4 at 66 BPM', () => {
    expect(BPM).toBe(66)
    expect(BEATS_PER_BAR).toBe(3)
    expect(BARS).toBe(16)
    expect(LOOP_BEATS).toBe(48)
    expect(LOOP_SECONDS).toBeCloseTo(48 * SEC_PER_BEAT, 9)
    const notes = composeLoop(1, 'play')
    expect(notes.every((n) => n.t >= 0 && n.t < LOOP_BEATS)).toBe(true)
    expect(notes.every((n) => n.dur > 0 && n.vel > 0 && n.vel <= 1)).toBe(true)
    expect(notes.every((n) => ['box', 'pad', 'bass', 'sparkle'].includes(n.voice))).toBe(true)
  })

  it('bass hits beat 1 of every bar, pad covers the whole bar', () => {
    const notes = composeLoop(1, 'play')
    const bass = notes.filter((n) => n.voice === 'bass')
    expect(bass.length).toBe(16)
    expect(bass.every((n) => n.t % BEATS_PER_BAR === 0)).toBe(true)
    const pad = notes.filter((n) => n.voice === 'pad')
    expect(pad.length).toBe(32) // root + fifth, every bar
    expect(pad.every((n) => n.t % BEATS_PER_BAR === 0 && n.dur === BEATS_PER_BAR)).toBe(true)
  })

  it('every box/sparkle note is in the F pentatonic', () => {
    for (const arrangement of ['play', 'menu', 'moonrise']) {
      for (let seed = 1; seed <= 5; seed++) {
        const notes = composeLoop(seed, arrangement)
        for (const n of notes.filter((x) => x.voice === 'box' || x.voice === 'sparkle')) {
          expect(PENTA_PC.has(pc(n.midi))).toBe(true)
        }
      }
    }
  })

  it('no minor-2nd pair sounds together at any moment', () => {
    for (const arrangement of ['play', 'menu', 'moonrise']) {
      for (let seed = 1; seed <= 5; seed++) {
        const notes = composeLoop(seed, arrangement)
        // Sample every 0.1 beat across the loop, plus every note onset.
        const times = new Set()
        for (let t = 0; t < LOOP_BEATS; t += 0.1) times.add(Math.round(t * 10) / 10)
        for (const n of notes) times.add(n.t)
        for (const t of times) {
          const at = sounding(notes, t)
          for (let i = 0; i < at.length; i++) {
            for (let j = i + 1; j < at.length; j++) {
              const d = Math.abs(pc(at[i].midi) - pc(at[j].midi)) % 12
              expect(d).not.toBe(1)
              expect(d).not.toBe(11)
            }
          }
        }
      }
    }
  })

  it('same seed composes the same loop, another seed changes >= 20% of melody notes', () => {
    const a = composeLoop(7, 'play')
    const b = composeLoop(7, 'play')
    expect(b).toEqual(a)
    const c = composeLoop(8, 'play')
    const ma = a.filter((n) => n.voice === 'box').map((n) => n.midi)
    const mc = c.filter((n) => n.voice === 'box').map((n) => n.midi)
    const len = Math.min(ma.length, mc.length)
    let diff = 0
    for (let i = 0; i < len; i++) if (ma[i] !== mc[i]) diff++
    expect(diff / len).toBeGreaterThanOrEqual(0.2)
  })

  it('melody density is 25-60 notes/min and the longest melody silence is <= 4s', () => {
    for (const arrangement of ['play', 'menu', 'moonrise']) {
      for (let seed = 1; seed <= 5; seed++) {
        const notes = composeLoop(seed, arrangement)
        const box = notes.filter((n) => n.voice === 'box')
        const perMin = box.length / (LOOP_SECONDS / 60)
        expect(perMin).toBeGreaterThanOrEqual(25)
        expect(perMin).toBeLessThanOrEqual(60)
        // Gaps between consecutive melody onsets, wrapping around the loop.
        const onsets = box.map((n) => n.t).sort((x, y) => x - y)
        let maxGap = 0
        for (let i = 0; i < onsets.length; i++) {
          const next = i + 1 < onsets.length ? onsets[i + 1] : onsets[0] + LOOP_BEATS
          maxGap = Math.max(maxGap, next - onsets[i])
        }
        expect(maxGap * SEC_PER_BEAT).toBeLessThanOrEqual(4)
      }
    }
  })
})
