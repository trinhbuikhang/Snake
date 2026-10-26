// music-baseline.mjs — M03 lullaby acceptance metrics, no browser needed.
// Runs the real composeLoop + scheduler against a mock AudioContext for
// 10 simulated minutes and reports the numbers the plan's M03 acceptance
// pins: oscillators created/min, peak concurrency, melody density,
// longest melody silence, scheduler bus gain, tick p95.
// usage: node docs/plan/polish/tooling/music-baseline.mjs [seed] [arrangement]
import { music, __test__ } from '../../../../src/audio/music.js'
import { composeLoop, LOOP_SECONDS, SEC_PER_BEAT } from '../../../../src/audio/lullaby.js'

class MockParam {
  constructor(value = 0) {
    this.value = value
  }
  setValueAtTime(v) {
    this.value = v
  }
  linearRampToValueAtTime(v) {
    this.value = v
  }
  exponentialRampToValueAtTime(v) {
    this.value = v
  }
  setTargetAtTime(v) {
    this.value = v
  }
  cancelScheduledValues() {}
}
class MockNode {
  constructor() {
    this.stoppedAt = null
  }
  connect() {}
  disconnect() {}
  start(at) {
    this.startedAt = at
  }
  stop(at) {
    this.stoppedAt = at
  }
}
class MockCtx {
  constructor() {
    this.currentTime = 0
    this.state = 'running'
    this.oscillators = []
  }
  createOscillator() {
    const o = new MockNode()
    o.frequency = new MockParam(440)
    this.oscillators.push(o)
    return o
  }
  createGain() {
    const g = new MockNode()
    g.gain = new MockParam(0)
    return g
  }
  createBiquadFilter() {
    const f = new MockNode()
    f.frequency = new MockParam(2400)
    return f
  }
}

const seed = parseInt(process.argv[2] || '1', 10)
const arrangement = process.argv[3] || 'play'
const fake = new MockCtx()
const bus = fake.createGain()
music.attach(fake, bus)
music.start(arrangement, seed)

const notes = composeLoop(seed, arrangement)
const box = notes.filter((n) => n.voice === 'box')
const onsets = box.map((n) => n.t).sort((a, b) => a - b)
let maxGap = 0
for (let i = 0; i < onsets.length; i++) {
  const next = i + 1 < onsets.length ? onsets[i + 1] : onsets[0] + 48
  maxGap = Math.max(maxGap, next - onsets[i])
}

let peak = 0
const tickTimes = []
for (let step = 0; step < 3000; step++) {
  fake.currentTime += 0.2
  const t0 = performance.now()
  __test__.tick()
  tickTimes.push(performance.now() - t0)
  peak = Math.max(peak, __test__.state().activeCount)
}
tickTimes.sort((a, b) => a - b)
const p95 = tickTimes[Math.floor(tickTimes.length * 0.95)]
const busGainDuringPlay = __test__.state().schedBusGain
music.stop(0)

console.log(
  JSON.stringify(
    {
      arrangement,
      seed,
      loopSeconds: LOOP_SECONDS,
      notesPerLoop: notes.length,
      boxNotesPerLoop: box.length,
      melodyNotesPerMin: +(box.length / (LOOP_SECONDS / 60)).toFixed(1),
      longestMelodySilenceS: +(maxGap * SEC_PER_BEAT).toFixed(2),
      oscillatorsCreated: fake.oscillators.length,
      oscillatorsPerMin: +(fake.oscillators.length / 10).toFixed(1),
      peakConcurrentOscillators: peak,
      schedulerBusGain: busGainDuringPlay,
      tickP95Ms: +p95.toFixed(3),
    },
    null,
    2,
  ),
)
