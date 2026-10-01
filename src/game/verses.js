// The Lunar Chronicle — 30 two-line moon verses ("Biên niên trăng").
//
// Unlike whispers (one-line, event-driven), verses are *earned* through
// deliberate feats and assemble the myth of the Ink Serpent out of order —
// sculptural narrative: the player pieces the story together themselves.
// The final verse unlocks only when the other 29 are heard.
//
// Pure data + pure trigger predicates: no React/Three/DOM, unit-testable.
// ctx shape (built by the store): whispers-style ctx plus
// { nightEvent, bests, unlocked (verse ids), totals: { spiritCatches,
//   zenSessions, lanternFeasts, ... } }.

const E = (event) => (c) => c.event === event
const SCORE = (n) => (c) => (c.event === 'eat' || c.event === 'supernova') && c.score >= n
const END = (c) => c.event === 'death' || c.event === 'zenEnd'

export const VERSES = [
  { id: 'verse-first-breath', lines: ['You surfaced from the ink,', 'and the moon was waiting.'],
    when: END },
  { id: 'verse-hundred-lights', lines: ['One hundred lights in a single night —', 'the sky will remember this.'],
    when: SCORE(100) },
  { id: 'verse-serpent-knot', lines: ['Thirty segments long,', 'you tied the night in a knot no one can undo.'],
    when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.length >= 30 },
  { id: 'verse-full-moon-gambit', lines: ['Under the full moon you gambled,', 'and the moon paid its debt.'],
    when: (c) => SCORE(50)(c) && c.moonPhase === 'full' },
  { id: 'verse-dark-moon-seer', lines: ['In darkness you learned to see —', 'thirty lights, no moon at all.'],
    when: (c) => SCORE(30)(c) && c.moonPhase === 'new' },
  { id: 'verse-half-moon-true', lines: ['Under the honest half-moon,', 'forty lights, no tricks.'],
    when: (c) => SCORE(40)(c) && c.moonPhase === 'half' },
  { id: 'verse-lantern-sixty', lines: ['Sixty stars in sixty seconds —', 'the lanterns will sing of this.'],
    when: (c) => c.event === 'death' && c.cause === 'time' && c.score >= 60 },
  { id: 'verse-lantern-survivor', lines: ['You outlasted the clock;', 'the night applauded in starlight.'],
    when: (c) => c.event === 'death' && c.cause === 'time' },
  { id: 'verse-lantern-devotee', lines: ['Five feasts against the clock.', 'Hunger is your art.'],
    when: (c) => c.totals.lanternFeasts >= 5 },
  { id: 'verse-zen-deep', lines: ['Fifty lights gathered in a dream', 'that never had to end.'],
    when: (c) => SCORE(50)(c) && c.mode === 'zen' },
  { id: 'verse-zen-long-body', lines: ['In the dream you grew long,', 'and the lake made room.'],
    when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.mode === 'zen' && c.length >= 20 },
  { id: 'verse-zen-devotee', lines: ['Three dreams completed.', 'The lake dreams of you too.'],
    when: (c) => c.totals.zenSessions >= 3 },
  { id: 'verse-supernova-three', lines: ['Three last lights in one night —', 'you are becoming their keeper.'],
    when: (c) => c.event === 'supernova' && c.nightStats.supernovas >= 3 },
  { id: 'verse-star-in-dark', lines: ['You carried a dying star', 'into the dark with you.'],
    when: (c) => c.event === 'death' && (c.cause === 'wall' || c.cause === 'self') && c.nightStats.supernovas > 0 },
  { id: 'verse-ten-nights', lines: ['Ten nights. The ripples', 'remember your name.'],
    when: (c) => c.event === 'nightStart' && c.night >= 10 },
  { id: 'verse-twenty-nights', lines: ['Twenty nights of ink and patience.', 'Legends are just regulars.'],
    when: (c) => c.event === 'nightStart' && c.night >= 20 },
  { id: 'verse-mode-master', lines: ['Hunter, guest, dreamer —', 'master of all three.'],
    when: (c) => c.bests.classic >= 40 && c.bests.lantern >= 40 && c.bests.zen >= 40 },
  { id: 'verse-whisper-keeper-10', lines: ['Ten whispers. The night', 'is starting to trust you.'],
    when: (c) => c.unlockedWhispers.length >= 10 },
  { id: 'verse-whisper-keeper-30', lines: ['Thirty whispers. You speak', "the lake's own language now."],
    when: (c) => c.unlockedWhispers.length >= 30 },
  { id: 'verse-first-spirit', lines: ['The Jade Carp chose you.', 'Few are chosen.'],
    when: E('spirit') },
  { id: 'verse-spirit-thrice', lines: ['Three times the carp has come.', 'The garden is fond of you.'],
    when: (c) => c.totals.spiritCatches >= 3 },
  { id: 'verse-meteor-night', lines: ['The sky wept meteors,', 'and you drank every tear.'],
    when: (c) => c.event === 'nightStart' && c.nightEvent === 'meteor' },
  { id: 'verse-fog-night', lines: ['Through fog you found', 'thirty fallen stars.'],
    when: (c) => SCORE(30)(c) && c.nightEvent === 'fog' },
  { id: 'verse-tide-night', lines: ['Against the high tide,', 'forty lights held fast.'],
    when: (c) => SCORE(40)(c) && c.nightEvent === 'tide' },
  { id: 'verse-silent-night', lines: ['A silent night, well kept.', 'The small lights thank you.'],
    when: (c) => END(c) && c.nightEvent === 'silent' },
  { id: 'verse-bloom-night', lines: ['The garden bloomed,', 'and slowed the night for you.'],
    when: (c) => c.event === 'nightStart' && c.nightEvent === 'bloom' },
  { id: 'verse-classic-marathon', lines: ['One hundred fifty lights.', 'The classic hunt, perfected.'],
    when: (c) => SCORE(150)(c) && c.mode === 'classic' },
  { id: 'verse-dash-dancer', lines: ['Five stars taken at full speed —', 'the wind itself applauds.'],
    when: (c) => c.event === 'eat' && c.nightStats.boostEats >= 5 },
  { id: 'verse-garden-ghost', lines: ['Twenty-five endings,', 'and still you return.'],
    when: (c) => c.totals.deaths >= 25 },
  // P4 — The Garden Remembers.
  { id: 'verse-moonrise', lines: ['The moon leaned close,', 'and the sky rained stars.'],
    when: (c) => c.event === 'nightStart' && c.nightEvent === 'moonrise' },
  { id: 'verse-garden-awakens', lines: ['You hung a lantern', 'where the dark used to be.'],
    when: (c) => c.event === 'garden' },
  // The final verse: only when every other verse has been heard.
  { id: 'verse-ink-legend', lines: ['You are the story', 'the lake has been telling.'],
    when: (c) => c.unlocked.length >= VERSES.length - 1 },
]

export const VERSE_IDS = VERSES.map((v) => v.id)
export const VERSE_COUNT = VERSES.length

export function verseById(id) {
  return VERSES.find((v) => v.id === id) || null
}

// Pure evaluation: which verses unlock now, given the context?
export function evaluateVerses(ctx) {
  const has = new Set(ctx.unlocked || [])
  return VERSES.filter((v) => !has.has(v.id) && v.when(ctx))
}
