// Fully procedural Web Audio: koto pluck on eat, airy pad while playing,
// bamboo tick on turn, dull thud + water drop on death. No external assets required.

let ctx = null
let master = null
let muted = false
let unlocked = false
let padOn = false
let pad = null
let padGain = null
let padLfo = null
let noiseBuf = null
let eatStep = 0

function ensureCtx() {
  if (ctx) return ctx
  // P6: the store imports this module, and the store also runs in non-browser
  // contexts (tests, SSR) — audio simply stays silent there.
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 8
  comp.connect(ctx.destination)
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 1
  master.connect(comp)
  // 0.6s of smoothed white noise, reused by every percussive voice.
  const len = Math.floor(ctx.sampleRate * 0.6)
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

export function unlockAudio() {
  const c = ensureCtx()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
  unlocked = true
}

export function setMuted(m) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02)
}

function pluck(freq, at, vol = 0.5) {
  if (!ctx || !master) return
  const c = ctx
  // Body: a triangle pluck with a fast attack and a woody decay.
  const o = c.createOscillator()
  o.type = 'triangle'
  o.frequency.value = freq
  const g = c.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34)
  o.connect(g)
  g.connect(master)
  o.start(at)
  o.stop(at + 0.4)
  // Harmonic shimmer so it reads as silk over a pluck.
  const o2 = c.createOscillator()
  o2.type = 'sine'
  o2.frequency.value = freq * 2.003
  const g2 = c.createGain()
  g2.gain.setValueAtTime(0, at)
  g2.gain.linearRampToValueAtTime(vol * 0.22, at + 0.006)
  g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.22)
  o2.connect(g2)
  g2.connect(master)
  o2.start(at)
  o2.stop(at + 0.25)
}

function tickNoise(at = 0, vol = 0.1, freq = 5000) {
  if (!ctx || !master || !noiseBuf) return
  const c = ctx
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 1.4
  const g = c.createGain()
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06)
  src.connect(bp)
  bp.connect(g)
  g.connect(master)
  src.start(at)
  src.stop(at + 0.08)
}

const PENTA = [0, 2, 4, 7, 9]

export function playEat() {
  unlockAudio()
  if (!ctx || !master) return
  const base = 329.63 // E4 (crisp pentatonic chime)
  const idx = PENTA[eatStep % PENTA.length]
  const oct = Math.floor(eatStep / PENTA.length)
  eatStep++
  const f = base * Math.pow(2, idx / 12) * Math.pow(2, Math.min(oct, 2))
  pluck(f, ctx.currentTime + 0.005, 0.48)
  pluck(f * 1.5, ctx.currentTime + 0.035, 0.22)
  pluck(f * 2.0, ctx.currentTime + 0.065, 0.12)
  tickNoise(ctx.currentTime + 0.005, 0.04, 4500)
}

export function playBloom() {
  unlockAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime + 0.01
  // Celestial arpeggio
  pluck(440, t, 0.5) // A4
  pluck(554.37, t + 0.06, 0.42) // C#5
  pluck(659.25, t + 0.12, 0.38) // E5
  pluck(880, t + 0.18, 0.32) // A5
  tickNoise(t, 0.07, 7200)
}

// P6 "First Light": a slow moon-chime when a verse of the chronicle is unlocked.
// Sparser and higher than the bloom arpeggio so the two never blur together.
export function playVerse() {
  unlockAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime + 0.01
  pluck(1046.5, t, 0.3) // C6
  pluck(784.0, t + 0.22, 0.24) // G5
  pluck(1318.5, t + 0.46, 0.2) // E6
  tickNoise(t + 0.46, 0.03, 8000)
}

export function playTurn() {
  unlockAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime
  // Soft gentle water swish / bamboo brush
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(680, t)
  o.frequency.exponentialRampToValueAtTime(320, t + 0.06)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.04, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + 0.07)
}

const melodyTone = (freq, at, dur, vol) => {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq * 0.92, at)
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, at + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g)
  g.connect(master)
  o.start(at)
  o.stop(at + dur + 0.02)
}

export function playDeath() {
  unlockAudio()
  if (!ctx || !master) return
  const t = ctx.currentTime
  melodyTone(105, t, 0.5, 0.5)
  melodyTone(62, t + 0.02, 0.6, 0.4)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(1250, t + 0.12)
  o.frequency.exponentialRampToValueAtTime(220, t + 0.45)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t + 0.12)
  g.gain.linearRampToValueAtTime(0.26, t + 0.15)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  o.connect(g)
  g.connect(master)
  o.start(t + 0.12)
  o.stop(t + 0.52)
  tickNoise(t + 0.015, 0.12, 400)
}

export function setPadOn(on) {
  if (on === padOn) return
  padOn = on
  if (!ctx || !master) return
  const c = ctx
  if (on && !pad) {
    padGain = c.createGain()
    padGain.gain.value = 0
    padGain.connect(master)
    const o1 = c.createOscillator()
    o1.type = 'sine'
    o1.frequency.value = 55
    const o2 = c.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = 110.4
    const o3 = c.createOscillator()
    o3.type = 'triangle'
    o3.frequency.value = 219.7
    const o1g = c.createGain()
    o1g.gain.value = 0.16
    const o2g = c.createGain()
    o2g.gain.value = 0.1
    const o3g = c.createGain()
    o3g.gain.value = 0.035
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 520
    if (noiseBuf) {
      const ns = c.createBufferSource()
      ns.buffer = noiseBuf
      ns.loop = true
      const nf = c.createBiquadFilter()
      nf.type = 'lowpass'
      nf.frequency.value = 240
      const ng = c.createGain()
      ng.gain.value = 0.05
      ns.connect(nf)
      nf.connect(ng)
      ng.connect(padGain)
      ns.start()
    }
    o1.connect(o1g)
    o2.connect(o2g)
    o3.connect(o3g)
    o1g.connect(filter)
    o2g.connect(filter)
    o3g.connect(filter)
    filter.connect(padGain)
    o1.start()
    o2.start()
    o3.start()
    padLfo = c.createOscillator()
    padLfo.frequency.value = 0.08
    const lfoGain = c.createGain()
    lfoGain.gain.value = 0
    padLfo.connect(lfoGain)
    lfoGain.connect(padGain.gain)
    padLfo.start()
    padGain.gain.setTargetAtTime(0.055, c.currentTime, 0.6)
    lfoGain.gain.setTargetAtTime(0.02, c.currentTime, 0.8)
    pad = { o1, o2, o3 }
  }
  if (!on && pad) {
    const c2 = ctx
    padGain.gain.setTargetAtTime(0, c2.currentTime, 0.25)
    const voices = pad
    setTimeout(() => {
      if (padOn) return
      try {
        voices.o1.stop()
        voices.o2.stop()
        voices.o3.stop()
        if (padLfo) padLfo.stop()
      } catch {
        /* already stopped */
      }
      pad = null
      padLfo = null
      padGain = null
    }, 1200)
  }
}

// P6 "First Light": Silent Night keeps its promise — no music, only water.
// A soft looping lap of filtered noise with a slow swell and the occasional
// droplet plink. Mirrors setPadOn's fade structure.
let waterOn = false
let waterNodes = null

export function setWaterOn(on) {
  if (on === waterOn) return
  waterOn = on
  if (!ctx || !master || !noiseBuf) return
  const c = ctx
  if (on && !waterNodes) {
    const gain = c.createGain()
    gain.gain.value = 0
    gain.connect(master)
    const src = c.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    src.playbackRate.value = 0.5
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 320
    lp.Q.value = 0.6
    const ng = c.createGain()
    ng.gain.value = 0.5
    src.connect(lp)
    lp.connect(ng)
    ng.connect(gain)
    src.start()
    // Slow swell on the filter so the water breathes.
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.11
    const lfoG = c.createGain()
    lfoG.gain.value = 140
    lfo.connect(lfoG)
    lfoG.connect(lp.frequency)
    lfo.start()
    gain.gain.setTargetAtTime(0.05, c.currentTime, 1.2)
    const droplet = () => {
      if (!waterOn || !ctx || !master) return
      const t = c.currentTime + 0.02
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(1500 + Math.random() * 600, t)
      o.frequency.exponentialRampToValueAtTime(620, t + 0.18)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.linearRampToValueAtTime(0.055, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
      o.connect(g)
      g.connect(master)
      o.start(t)
      o.stop(t + 0.36)
    }
    const timer = setInterval(() => {
      if (Math.random() < 0.75) droplet()
    }, 2600)
    waterNodes = { src, lfo, gain, timer }
  }
  if (!on && waterNodes) {
    const nodes = waterNodes
    clearInterval(nodes.timer)
    nodes.gain.gain.setTargetAtTime(0, c.currentTime, 0.4)
    setTimeout(() => {
      if (waterOn) return
      try {
        nodes.src.stop()
        nodes.lfo.stop()
      } catch {
        /* already stopped */
      }
      try {
        nodes.gain.disconnect()
      } catch {
        /* already disconnected */
      }
      waterNodes = null
    }, 1500)
  }
}

export const audio = { unlockAudio, setMuted, playEat, playBloom, playVerse, playTurn, playDeath, setPadOn, setWaterOn }
export default audio