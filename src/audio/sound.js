// Fully procedural Web Audio: koto pluck on eat, airy pad while playing,
// bamboo tick on turn, dull thud + water drop on death. No external assets required.

let ctx = null
let master = null
let muted = false
let unlocked = false
let suspendTimer = null
let ctxStateListener = null

// Report context state changes to the lifecycle layer (unlock.js): the
// reducer tracks ctxState, and only a real onstatechange can tell it an
// iOS interruption happened — no poll, no gesture, no event otherwise
// reveals 'interrupted'. The handler is owned by the context instance it
// was attached to, so a test reset that drops the context cannot make a
// stale context report a new context's state.
function attachStateListener() {
  if (!ctx || !ctxStateListener) return
  const owned = ctx
  ctx.onstatechange = () => {
    if (ctxStateListener && ctx === owned) ctxStateListener(owned.state)
  }
}

export function setCtxStateListener(cb) {
  ctxStateListener = cb
  attachStateListener()
}

export function getCtxState() {
  return ctx ? ctx.state : null
}
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
  attachStateListener()
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

// A voice enabled while there is no AudioContext yet — or while muted —
// only records its desired state (the *On flags below). Start it as soon as
// sound becomes possible: when the context is unlocked, or on unmute.
// Without this, setAmbientOn(true) before the first user gesture wedged the
// flag forever (AUDIT L5): the voice never started and later calls no-oped.
function startPendingVoices() {
  if (!ctx || !master || muted) return
  if (ambientOn) startAmbient()
  if (padOn) startPad()
  if (waterOn) startWater()
}

export function unlockAudio() {
  // A gesture during the 0.2s hide-fade must win over the pending
  // suspend, or the context would suspend right after the user returned.
  cancelPendingSuspend()
  const c = ensureCtx()
  // M01: Teams iPhone parks the context in 'interrupted', not
  // 'suspended' — resuming only the latter left returning players mute
  // until some later gesture happened to call unlockAudio again.
  if (c && (c.state === 'suspended' || c.state === 'interrupted')) c.resume().catch(() => {})
  // A hide-fade may have ramped the master bus to 0; restore it so the
  // resumed context is actually audible. No-op when already at 1.
  resetMasterGain()
  unlocked = true
  startPendingVoices()
}

// Round-2 review: cancel any scheduled automation BEFORE setting the
// restore target. A setTarget inserted before an existing linearRamp
// loses to the ramp at its end time — on rapid hide→show the fade's
// ramp pulled the bus back to 0 after the restore and held it there,
// while the context stayed 'running' (so no activation listener was left
// to rescue it). fadeOutAudio already follows this pattern; the restore
// paths must too. Creates nothing: callers that must not create a
// context (visible before the first gesture) use restoreAudio below.
function resetMasterGain() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.05)
}

// M01 hide path, as two reducer actions: fade the master bus to silence
// over exactly 0.2s, then suspend the context once the fade has landed.
export function fadeOutAudio() {
  if (!ctx || !master) return
  const t = ctx.currentTime
  master.gain.cancelScheduledValues(t)
  master.gain.setValueAtTime(master.gain.value, t)
  master.gain.linearRampToValueAtTime(0, t + 0.2)
}

export function suspendAudio() {
  if (!ctx || suspendTimer) return
  // Round-2 review note: 250ms, not exactly 200ms — the fade lands at
  // 200ms, and suspending a hair later guarantees the bus is fully
  // silent first (one probe caught a suspend with gain still at 0.013).
  suspendTimer = setTimeout(() => {
    suspendTimer = null
    if (ctx) ctx.suspend().catch(() => {})
  }, 250)
}

export function cancelPendingSuspend() {
  if (!suspendTimer) return
  clearTimeout(suspendTimer)
  suspendTimer = null
}

// M01 review fix: restore the master bus gain WITHOUT creating a
// context. unlockAudio() cannot serve the visible/pageshow pre-step —
// it calls ensureCtx, so a visible event before the first gesture would
// create an AudioContext, breaking the no-create-before-gesture rule.
// restoreAudio is a no-op with no context, so it is safe to call on
// every visible/pageshow.
export function restoreAudio() {
  resetMasterGain()
}

export function setMuted(m) {
  muted = m
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02)
  if (!m) startPendingVoices()
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

function startPad() {
  if (pad) return
  const c = ctx
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
  let noise = null
  if (noiseBuf) {
    noise = c.createBufferSource()
    noise.buffer = noiseBuf
    noise.loop = true
    const nf = c.createBiquadFilter()
    nf.type = 'lowpass'
    nf.frequency.value = 240
    const ng = c.createGain()
    ng.gain.value = 0.05
    noise.connect(nf)
    nf.connect(ng)
    ng.connect(padGain)
    noise.start()
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
  pad = { o1, o2, o3, noise }
}

function stopPad() {
  const voices = pad
  if (!voices) return
  // Detach the live refs NOW, not when the teardown fires (AUDIT L5): a
  // re-enable inside the 1.2s window must build a fresh voice below, never
  // inherit these fading ones and stay silent while the flag says "on".
  pad = null
  const gain = padGain
  const lfo = padLfo
  padGain = null
  padLfo = null
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
  // This teardown owns exactly the nodes captured above and always runs —
  // checking the desired-state flag here is what leaked the old graph.
  setTimeout(() => {
    try {
      voices.o1.stop()
      voices.o2.stop()
      voices.o3.stop()
      if (voices.noise) voices.noise.stop()
      if (lfo) lfo.stop()
      gain.disconnect()
    } catch {
      /* already stopped or disconnected */
    }
  }, 1200)
}

export function setPadOn(on) {
  if (on === padOn) return
  padOn = on
  if (!on) {
    if (ctx && master) stopPad()
    return
  }
  // No context yet, or muted: record the intent only — no oscillators are
  // created (L5). unlockAudio()/setMuted(false) start the voice later.
  if (!ctx || !master || muted) return
  startPad()
}

// P6 "First Light": Silent Night keeps its promise — no music, only water.
// A soft looping lap of filtered noise with a slow swell and the occasional
// droplet plink. Mirrors setPadOn's fade structure.
let waterOn = false
let waterNodes = null

function startWater() {
  if (waterNodes || !noiseBuf) return
  const c = ctx
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
    if (muted) return // T10d review: no droplet oscillators while muted
    if (!waterOn || !ctx || !master) return
    // M01: the water timer keeps firing while the tab is hidden, but a
    // suspended/interrupted context must not schedule droplets that
    // would burst out on resume (the "bỏ qua" half of the acceptance).
    if (ctx.state !== undefined && ctx.state !== 'running') return
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

function stopWater() {
  const nodes = waterNodes
  if (!nodes) return
  // Same detach-now rule as the pad (AUDIT L5): a rapid re-enable builds a
  // fresh voice and droplet timer instead of reviving this fading one.
  waterNodes = null
  clearInterval(nodes.timer)
  nodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
  setTimeout(() => {
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
  }, 1500)
}

export function setWaterOn(on) {
  if (on === waterOn) return
  waterOn = on
  if (!on) {
    if (ctx && master) stopWater()
    return
  }
  // No context yet, or muted: record the intent only (L5) — the voice
  // starts from unlockAudio()/setMuted(false) via startPendingVoices().
  if (!ctx || !master || muted) return
  startWater()
}

// (ambient score section follows; `audio` is exported at the end of the file)

// ---- Generative ambient score ("the garden sings") -------------------------
// P6 music, part 1: a sparse, endless koto-like melody woven from the minor
// pentatonic, retuned by the night's moon phase. No samples, no files — pure
// oscillators through the shared master bus, so the existing mute toggle and
// compressor govern it exactly like every other voice. Silent Night is
// untouched: engine.js never turns the ambient on for it.

const MINOR_PENTA = [0, 3, 5, 7, 10, 12, 15, 17]

// root note, phrase density (0..1) and air (lowpass Hz) per moon phase.
// Thin moons sing low, dark and rare; the full moon sings higher and brighter.
const PHASE_TUNING = {
  new:      { root: 110.0,  density: 0.45, air: 640 },
  crescent: { root: 98.0,   density: 0.55, air: 760 },
  half:     { root: 110.0,  density: 0.65, air: 880 },
  gibbous:  { root: 130.81, density: 0.75, air: 1020 },
  full:     { root: 146.83, density: 0.85, air: 1180 },
}
let ambientPhase = PHASE_TUNING.half
let ambientOn = false
let ambientTimer = null
let ambientGain = null
let ambientFilter = null
let nextPhraseAt = 0

export function setAmbientPhase(phaseId) {
  ambientPhase = PHASE_TUNING[phaseId] || PHASE_TUNING.half
  if (ambientFilter && ctx) {
    ambientFilter.frequency.setTargetAtTime(ambientPhase.air, ctx.currentTime, 0.8)
  }
}

// A long soft bloom: slow attack, a silk harmonic, a gentle fall.
// Sits an octave or two below the SFX chimes so the two never blur.
function bloom(freq, at, vol = 0.07, dur = 2.4) {
  if (!ctx || !ambientFilter) return
  const c = ctx
  const o = c.createOscillator()
  o.type = 'sine'
  o.frequency.value = freq
  const o2 = c.createOscillator()
  o2.type = 'triangle'
  o2.frequency.value = freq * 2.001
  const g2 = c.createGain()
  g2.gain.value = 0.22 // shimmer blend
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.linearRampToValueAtTime(vol, at + 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g)
  o2.connect(g2)
  g2.connect(g)
  g.connect(ambientFilter)
  o.start(at)
  o2.start(at)
  o.stop(at + dur + 0.1)
  o2.stop(at + dur + 0.1)
}

// One phrase: 1–3 notes wandering the minor pentatonic, then silence.
// Rests are music too — density follows the moon.
function maybePlayPhrase(at) {
  const { root, density } = ambientPhase
  if (Math.random() > 0.3 + 0.7 * density) return
  const count = 1 + Math.floor(Math.random() * 3)
  let deg = Math.floor(Math.random() * 5)
  const dir = Math.random() < 0.5 ? 1 : -1
  let t = at
  for (let i = 0; i < count; i++) {
    const semis = MINOR_PENTA[Math.max(0, Math.min(MINOR_PENTA.length - 1, deg))]
    bloom(root * Math.pow(2, semis / 12), t, 0.05 + Math.random() * 0.035, 2.0 + Math.random() * 1.2)
    deg += dir * (1 + Math.floor(Math.random() * 2))
    t += 0.8 + Math.random() * 0.7
  }
}

function planPhrases() {
  if (!ambientOn || !ctx || !ambientGain) return
  // While muted the master bus is silent, but scheduling anyway would
  // still build (and throw away) a phrase's oscillators every few
  // seconds for nothing (AUDIT L5). Skip the pass entirely and leave
  // nextPhraseAt behind; the clamp below resyncs it on the first live
  // pass after unmute, so no backed-up phrases burst out.
  if (muted) return
  // The scheduler interval is throttled while the tab is hidden, but the
  // audio clock keeps running. Without this clamp, a returning tab finds
  // nextPhraseAt far in the past and the loop below schedules every
  // overdue phrase at a past timestamp — a burst of notes all at once.
  // Overdue phrases are dropped; the garden resumes singing from now.
  // M01: same skip as the water droplet — a suspended/interrupted
  // context schedules nothing while its timer keeps firing hidden.
  if (ctx.state !== undefined && ctx.state !== 'running') return
  nextPhraseAt = Math.max(nextPhraseAt, ctx.currentTime + 0.1)
  const horizon = ctx.currentTime + 2.0
  while (nextPhraseAt < horizon) {
    maybePlayPhrase(nextPhraseAt)
    // Longer silences under a thin moon.
    nextPhraseAt += 2.5 + Math.random() * (7 - 5 * ambientPhase.density)
  }
}

function startAmbient() {
  if (ambientTimer) return
  const c = ctx
  ambientGain = c.createGain()
  ambientGain.gain.value = 0
  ambientFilter = c.createBiquadFilter()
  ambientFilter.type = 'lowpass'
  ambientFilter.frequency.value = ambientPhase.air
  ambientFilter.connect(ambientGain)
  ambientGain.connect(master)
  nextPhraseAt = c.currentTime + 1.4 // first phrase arrives after the fade-in
  ambientTimer = setInterval(planPhrases, 700)
  ambientGain.gain.setTargetAtTime(1, c.currentTime, 1.2)
}

function stopAmbient() {
  if (!ambientTimer) return
  clearInterval(ambientTimer)
  ambientTimer = null
  const g = ambientGain
  const f = ambientFilter
  // Detach the live refs NOW (AUDIT L5): the teardown below owns exactly
  // these two nodes and always disconnects them. The old code nulled the
  // refs inside the timeout and skipped it entirely when the voice had
  // been re-enabled — leaking the faded gain/filter pair into the graph
  // on every rapid off→on.
  ambientGain = null
  ambientFilter = null
  g.gain.setTargetAtTime(0, ctx.currentTime, 0.5)
  setTimeout(() => {
    try {
      g.disconnect()
      f.disconnect()
    } catch {
      /* already disconnected */
    }
  }, 1600)
}

export function setAmbientOn(on) {
  if (on === ambientOn) return
  ambientOn = on
  if (!on) {
    if (ctx && master) stopAmbient()
    return
  }
  // No context yet, or muted: record the intent only (L5) — the voice
  // starts from unlockAudio()/setMuted(false) via startPendingVoices().
  if (!ctx || !master || muted) return
  startAmbient()
}
export const audio = { unlockAudio, setMuted, playEat, playBloom, playVerse, playTurn, playDeath, setPadOn, setWaterOn, setAmbientOn, setAmbientPhase }

// Test seam (T05/T10d): lets unit tests drive the phrase scheduler and the
// voice toggles against a mock AudioContext and observe what gets
// scheduled, created and torn down. Not part of the public audio API.
export const __test__ = {
  planPhrases,
  mockAmbient(fakeCtx, { on = true, nextAt = 0 } = {}) {
    ctx = fakeCtx
    ambientFilter = fakeCtx.createBiquadFilter()
    ambientGain = fakeCtx.createGain()
    ambientOn = on
    nextPhraseAt = nextAt
  },
  // M01: inject a full mock context (plus its master bus) so voice
  // toggles and the fade/suspend path can be driven without a browser.
  mockCtx(fakeCtx) {
    ctx = fakeCtx
    master = fakeCtx.createGain()
    // startWater refuses without the shared noise buffer (normally built
    // by ensureCtx); a mock buffer object is enough for its source node.
    noiseBuf = fakeCtx.createBuffer ? fakeCtx.createBuffer(1, 10, fakeCtx.sampleRate || 44100) : {}
  },
  nextPhraseAt: () => nextPhraseAt,
  // Restore every module-level voice/context field to its load-time value
  // so toggle tests can start from a pristine module (T10d).
  reset() {
    cancelPendingSuspend()
    ctxStateListener = null
    ctx = null
    master = null
    muted = false
    unlocked = false
    padOn = false
    pad = null
    padGain = null
    padLfo = null
    noiseBuf = null
    eatStep = 0
    waterOn = false
    waterNodes = null
    ambientPhase = PHASE_TUNING.half
    ambientOn = false
    ambientTimer = null
    ambientGain = null
    ambientFilter = null
    nextPhraseAt = 0
  },
  state: () => ({
    muted,
    padOn,
    pad,
    waterOn,
    waterNodes,
    ambientOn,
    ambientTimer,
    ambientGain,
    ambientFilter,
  }),
}
export default audio
