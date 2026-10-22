// Audio baseline for docs/plan/POLISH_PLAN.md (workstream M).
// Tooling only — not part of the game build, not part of `npm test`.
// Drives the CURRENT ambient scheduler in src/audio/sound.js through its
// existing __test__ seam with a fake AudioContext and counts what one
// minute of "music" schedules (no audio device needed).
// usage (repo root): node docs/plan/polish/tooling/music-baseline.mjs
import { __test__ } from '../../../../src/audio/sound.js'

let seed = 7
Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

function fakeCtx() {
  const c = {
    currentTime: 0, oscStarts: [], freqs: [],
    createOscillator() { const o = { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start(at) { c.oscStarts.push(at); c.freqs.push(o.frequency.value) }, stop() {} }; return o },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} } },
    createBiquadFilter() { return { type: '', frequency: { value: 0, setTargetAtTime() {} }, Q: { value: 0 }, connect() {}, disconnect() {} } },
  }
  return c
}

for (const phase of ['new', 'half', 'full']) {
  __test__.reset()
  const c = fakeCtx()
  __test__.mockAmbient(c, { on: true, nextAt: 0 })
  // setAmbientPhase is exported from the module too
  const mod = await import('../../../../src/audio/sound.js')
  mod.setAmbientPhase(phase)
  for (let t = 0; t <= 600; t += 0.7) { c.currentTime = t; __test__.planPhrases() } // 10 minutes
  const notes = c.oscStarts.length / 2 // bloom() = sine + triangle shimmer
  const sorted = [...c.oscStarts].sort((a, b) => a - b)
  let maxGap = 0
  for (let i = 2; i < sorted.length; i += 2) maxGap = Math.max(maxGap, sorted[i] - sorted[i - 2])
  const f = c.freqs.filter((_, i) => i % 2 === 0)
  console.log(`ambient phase=${phase}: ${(notes / 10).toFixed(1)} notes/min, longest silence ${maxGap.toFixed(1)}s, pitch ${Math.min(...f).toFixed(0)}-${Math.max(...f).toFixed(0)} Hz (minor pentatonic), oscillators/min ${(c.oscStarts.length / 10).toFixed(1)}`)
}
console.log('pad (setPadOn): 3 oscillators 55/110.4/219.7 Hz + looped noise + LFO, lowpass 520 Hz — a constant drone under the ambient while playing')
