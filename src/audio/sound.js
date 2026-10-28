// Fully procedural Web Audio: koto pluck on eat, lullaby while playing,
// bamboo tick on turn, dull thud + water drop on death. No external assets required.
import { music } from './music.js'

let ctx = null
let master = null
let muted = false
let unlocked = false
// M02: the music bus — a child of master carrying every music voice
// (lullaby, water), but NOT the SFX, so turning music off leaves
// eat/bloom/turn/death sounds audible. Created with master in
// ensureCtx; volume changes only retarget it, never rebuild it.
let musicGain = null
let musicOn = true
let musicVolume = 0.6
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
  // M02 bus: created once, here — never on a volume drag.
  musicGain = ctx.createGain()
  musicGain.gain.value = musicOn ? musicVolume : 0
  musicGain.connect(master)
  // M03: the lullaby scheduler feeds the M02 bus from here on.
  music.attach(ctx, musicGain)
  // Sync the scheduler gate: toggles before the first gesture only
  // recorded flags, so the gate must catch up now.
  music.setGate({ muted, musicOn })
  // 0.6s of smoothed white noise, reused by every percussive voice.
  const len = Math.floor(ctx.sampleRate * 0.6)
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

// A voice enabled while there is no AudioContext yet — or while muted —
// only records its desired state (the *On flag below). Start it as soon as
// sound becomes possible: when the context is unlocked, or on unmute.
// Without this, setWaterOn(true) before the first user gesture wedged the
// flag forever (AUDIT L5): the voice never started and later calls no-oped.
function startPendingVoices() {
  if (!ctx || !master || muted) return
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
  // Round-1 review (M04): the engine's title menu music must start on
  // the first touch even when no store change follows it — notify the
  // unlock listener on the false -> true edge only, so later SFX calls
  // (which also route through unlockAudio) do not re-trigger it.
  if (!unlocked) {
    unlocked = true
    if (unlockListener) unlockListener()
  }
  startPendingVoices()
}

// Round-1 review (M04): lets the engine run its music target on the
// first real activation gesture. Set to null to unregister (destroy).
let unlockListener = null
export function setUnlockListener(cb) {
  unlockListener = cb
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
  // Round-1 review (M03): the lullaby scheduler must not create
  // oscillators while muted — the gate lives in music.js, sound.js
  // owns both flags and pushes them there.
  music.setGate({ muted, musicOn })
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02)
  if (!m) startPendingVoices()
}

// M02: music on/off + volume. Both only retarget the bus (≤0.1s via a
// 0.03 time constant) — dragging the slider never creates or destroys
// a node. With no context yet they only record the intent; ensureCtx
// builds the bus from these flags when the first gesture creates it.
// Round-1 review (M04): cancel + anchor before retargeting, with the
// M01 pattern — a ducking envelope's return ramp to the old volume
// must never outlive a Music-off or volume change and win over it.
export function setMusicOn(on) {
  musicOn = on
  music.setGate({ muted, musicOn })
  if (musicGain && ctx) {
    const t = ctx.currentTime
    musicGain.gain.cancelScheduledValues(t)
    musicGain.gain.setValueAtTime(musicGain.gain.value, t)
    musicGain.gain.setTargetAtTime(on ? musicVolume : 0, t, 0.03)
  }
}

export function setMusicVolume(v) {
  musicVolume = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10
  if (musicGain && ctx && musicOn) {
    const t = ctx.currentTime
    musicGain.gain.cancelScheduledValues(t)
    musicGain.gain.setValueAtTime(musicGain.gain.value, t)
    musicGain.gain.setTargetAtTime(musicVolume, t, 0.03)
  }
}

// M04 ducking: the SFX sit on master, the music on musicGain — dipping
// the music bus (never the SFX) by 6 dB while an eat/bloom/verse/death
// sounds keeps the chime audible over the lullaby. The envelope is
// re-issued per SFX, never stacked: each call cancels the previous
// release first, so the floor is exactly -6 dB no matter how fast the
// SFX arrive, and the bus is back at full volume 0.57s after the last
// duck (0.02 attack + 0.15 hold + 0.40 release).
const DUCK_DEPTH = 0.5 // -6 dB
const DUCK_ATTACK_S = 0.02
const DUCK_HOLD_S = 0.15
const DUCK_RELEASE_S = 0.4
export function duckMusic() {
  if (!ctx || !musicGain) return
  const base = musicOn ? musicVolume : 0
  const t = ctx.currentTime
  const p = musicGain.gain
  p.cancelScheduledValues(t)
  p.setValueAtTime(p.value, t)
  p.linearRampToValueAtTime(base * DUCK_DEPTH, t + DUCK_ATTACK_S)
  p.setValueAtTime(base * DUCK_DEPTH, t + DUCK_ATTACK_S + DUCK_HOLD_S)
  p.linearRampToValueAtTime(base, t + DUCK_ATTACK_S + DUCK_HOLD_S + DUCK_RELEASE_S)
}

// M04: whether any real activation gesture has unlocked audio yet —
// the engine's musicTarget needs it (no menu/play before gesture).
export function isUnlocked() {
  return unlocked
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
  duckMusic()
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
  duckMusic()
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
  duckMusic()
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
  duckMusic()
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

// P6 "First Light": Silent Night keeps its promise — no music, only water.
// A soft looping lap of filtered noise with a slow swell and the occasional
// droplet plink. Mirrors the fade structure of the old pad voice.
let waterOn = false
let waterNodes = null

function startWater() {
  if (waterNodes || !noiseBuf) return
  const c = ctx
  const gain = c.createGain()
  gain.gain.value = 0
  gain.connect(musicGain)
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

export const audio = { unlockAudio, isUnlocked, setUnlockListener, setMuted, setMusicOn, setMusicVolume, playEat, playBloom, playVerse, playTurn, playDeath, setWaterOn }

// Test seam (T05/T10d): lets unit tests drive the phrase scheduler and the
// voice toggles against a mock AudioContext and observe what gets
// scheduled, created and torn down. Not part of the public audio API.
export const __test__ = {
  // M01: inject a full mock context (plus its master bus) so voice
  // toggles and the fade/suspend path can be driven without a browser.
  mockCtx(fakeCtx) {
    ctx = fakeCtx
    master = fakeCtx.createGain()
    // M02 bus, created alongside master exactly as ensureCtx does.
    musicGain = fakeCtx.createGain()
    musicGain.gain.value = musicOn ? musicVolume : 0
    // startWater refuses without the shared noise buffer (normally built
    // by ensureCtx); a mock buffer object is enough for its source node.
    noiseBuf = fakeCtx.createBuffer ? fakeCtx.createBuffer(1, 10, fakeCtx.sampleRate || 44100) : {}
  },
  // Restore every module-level voice/context field to its load-time value
  // so toggle tests can start from a pristine module (T10d).
  reset() {
    cancelPendingSuspend()
    ctxStateListener = null
    unlockListener = null
    ctx = null
    master = null
    muted = false
    unlocked = false
    musicGain = null
    musicOn = true
    musicVolume = 0.6
    noiseBuf = null
    eatStep = 0
    waterOn = false
    waterNodes = null
  },
  state: () => ({
    muted,
    musicOn,
    musicVolume,
    musicGain,
    waterOn,
    waterNodes,
  }),
}
export default audio
