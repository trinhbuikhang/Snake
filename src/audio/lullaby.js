// Moonlit Garden Lullaby — pure composition, no Web Audio, no Math.random.
// composeLoop(seed, arrangement) -> notes { t (beats), dur (beats), midi,
// voice: 'box' | 'pad' | 'bass' | 'sparkle', vel } for 16 bars of 3/4 at
// 66 BPM. The melody lives only in the F major pentatonic (F G A C D),
// the chords walk F - Dm - Bb - C, and the form is A(8 bars) B(8 bars)
// with per-loop seed variation (the scheduler recomposes each loop with
// seed + loopIndex). The 'moonrise' arrangement is the same loop
// transposed +2 semitones: G major pentatonic (G A B D E), chords
// G - Em - C - D (M04 decision: "lên G trưởng").
//
// Why the harmony is clash-free (the lullaby test proves it, this is the
// reasoning): the pad plays only root + fifth of each chord, and the
// melody/sparkle never use A over a Bb bar. Every other combination of a
// pentatonic melody note with a root/fifth pad tone or a root bass note
// is at least 2 semitones apart — the pentatonic itself has no semitone
// steps, and the only semitone neighbours in the whole design are
// A<->Bb and E<->F, neither of which can sound together here (the pad
// never plays E, and A is excluded over Bb bars).

export const BPM = 66
export const BEATS_PER_BAR = 3
export const BARS = 16
export const LOOP_BEATS = BARS * BEATS_PER_BAR
export const SEC_PER_BEAT = 60 / BPM
export const LOOP_SECONDS = LOOP_BEATS * SEC_PER_BEAT

// F major pentatonic as semitone offsets from F.
const PENTA = [0, 2, 4, 7, 9]
const A_DEGREE = 2 // PENTA[2] = A, the one degree excluded over Bb bars
const MELODY_BASE = 65 // F4 — the music-box register
const SPARKLE_BASE = 77 // F5 — one octave above the melody

// One chord per bar: { bass (midi, octave 2), pad tones (root + fifth) }.
const CHORDS = [
  { bass: 41, pad: [53, 60] }, // F:  F2, F3 + C4
  { bass: 38, pad: [50, 57] }, // Dm: D2, D3 + A3
  { bass: 46, pad: [46, 53] }, // Bb: Bb2, Bb2 + F3
  { bass: 36, pad: [48, 55] }, // C:  C2, C3 + G3
]

// Small deterministic PRNG (mulberry32) — the pure code must never call
// Math.random, so the same seed always composes the same loop.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Melody degrees that avoid a semitone clash with the bar's chord: only
// the Bb bar excludes a degree (A against Bb).
function allowedDegrees(bar) {
  if (bar % 4 === 2) return [0, 1, 3, 4] // Bb bar: no A
  return [0, 1, 2, 3, 4]
}

export function composeLoop(seed, arrangement = 'play') {
  const rand = mulberry32(seed)
  const notes = []
  const isMenu = arrangement === 'menu'
  const isMoonrise = arrangement === 'moonrise'
  // A-section melody walks in small steps (a lullaby should sing, not
  // jump); the B-section (bars 8-15) is allowed wider leaps.
  let degree = 2 // start on A, the middle of the pentatonic
  let lastSparkleBar = -2 // sparkle gap rule: never two adjacent bars
  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[bar % 4]
    const t0 = bar * BEATS_PER_BAR
    const allowed = allowedDegrees(bar)
    const sectionB = bar >= 8
    // Bass: the root on beat 1, every bar, every arrangement except menu.
    if (!isMenu) {
      notes.push({ t: t0, dur: 1.5, midi: chord.bass, voice: 'bass', vel: 0.7 })
    }
    // Pad: root + fifth across the whole bar.
    for (const midi of chord.pad) {
      notes.push({ t: t0, dur: BEATS_PER_BAR, midi, voice: 'pad', vel: 0.5 })
    }
    // Melody anchor on beat 1 of every bar — this alone bounds the
    // longest melody silence to one bar (3 beats = 2.7s at 66 BPM).
    const step = sectionB ? 1 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2)
    const dir = rand() < 0.5 ? -1 : 1
    degree += dir * step
    // Keep the walk inside the pentatonic, folding back at the edges.
    while (degree < 0) degree += 5
    while (degree > 4) degree -= 5
    if (!allowed.includes(degree)) degree = allowed[0]
    const anchor = degree
    notes.push({
      t: t0,
      dur: 1,
      midi: MELODY_BASE + PENTA[anchor],
      voice: 'box',
      vel: isMoonrise ? 0.9 : 0.8,
    })
    // Extra melody notes: 0-2 per bar (menu: fewer), on beat 2, beat 3,
    // or the offbeat 2.5, stepping near the anchor.
    const extraCount = isMenu ? (rand() < 0.5 ? 1 : 0) : Math.floor(rand() * 3)
    const extraBeats = [1, 2, 2.5]
    for (let i = 0; i < extraCount; i++) {
      const beat = extraBeats[Math.floor(rand() * extraBeats.length)]
      let d = anchor + (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 2))
      while (d < 0) d += 5
      while (d > 4) d -= 5
      if (!allowed.includes(d)) continue
      // Never let a melody note ring across the bar line: an A allowed
      // in a Dm bar would otherwise still sound against the Bb bass of
      // the next bar (the one minor-2nd pair the per-bar exclusion
      // alone cannot prevent).
      const dur = Math.min(0.9, BEATS_PER_BAR - beat)
      notes.push({
        t: t0 + beat,
        dur,
        midi: MELODY_BASE + PENTA[d],
        voice: 'box',
        vel: 0.7,
      })
    }
    // Sparkle: a high pentatonic glint on beat 3. Play sprinkles it
    // (35% of bars) but never in two adjacent bars — the plan caps it
    // at one per two bars. The last bar of the loop never sparkles:
    // otherwise its sparkle would sit adjacent to the next loop's bar
    // 0 (the loop always restarts at the same point, so every run
    // longer than ~2:10 would hit the boundary pair). Moonrise lights
    // every other bar through the same gap rule; menu has none.
    const sparkleChance = isMoonrise ? 1 : isMenu ? 0 : 0.35
    if (rand() < sparkleChance && bar - lastSparkleBar >= 2 && bar < BARS - 1) {
      lastSparkleBar = bar
      let d = Math.floor(rand() * 5)
      if (!allowed.includes(d)) d = allowed[0]
      notes.push({
        t: t0 + 2,
        dur: 0.8,
        midi: SPARKLE_BASE + PENTA[d],
        voice: 'sparkle',
        vel: 0.4,
      })
    }
  }
  // Order by time so the scheduler can walk the array with one pointer.
  notes.sort((a, b) => a.t - b.t)
  // Moonrise transposition: every note +2 semitones. Transposition
  // preserves every interval, so the clash-free proof above still
  // holds verbatim — the excluded degree over a transposed Bb bar (C)
  // is the transposed A (B), the same semitone pair shifted up.
  if (isMoonrise) {
    for (const n of notes) n.midi += 2
  }
  return notes
}
