// Whispers of the Night — collectible one-line poems ("Lời thì thầm").
// Pure data + pure trigger predicates: no React/Three/DOM, unit-testable in node.
//
// Each whisper unlocks once, when its `when(ctx)` predicate first holds.
// ctx shape (built by the store):
// {
//   event: 'nightStart' | 'eat' | 'supernova' | 'death' | 'newBest' | 'zenEnd' | 'dash',
//   night, score, length, mode, moonPhase,
//   cause,                 // for 'death': 'wall' | 'self' | 'time'
//   isFirstMode, isFirstPhase,  // for 'nightStart'
//   totals: { supernovas, planets, deaths },
//   nightStats: { supernovas, planets },
//   seenModes: [...], seenPhases: [...],
//   unlocked: [...ids],
// }

const E = (event) => (c) => c.event === event

export const WHISPERS = [
  // ---- Nights -----------------------------------------------------------
  { id: 'night-1',   text: 'The ink was still wet on the first night.', when: (c) => c.event === 'nightStart' && c.night === 1 },
  { id: 'night-7',   text: 'Seven nights in, and the moon already knows your name.', when: (c) => c.event === 'nightStart' && c.night === 7 },
  { id: 'night-13',  text: 'The thirteenth night hums a stranger tune.', when: (c) => c.event === 'nightStart' && c.night === 13 },
  { id: 'night-30',  text: 'Thirty nights. The lake no longer pretends you are a stranger.', when: (c) => c.event === 'nightStart' && c.night === 30 },
  { id: 'night-50',  text: 'Fifty nights of ink and starlight. You are becoming legend.', when: (c) => c.event === 'nightStart' && c.night === 50 },
  { id: 'night-100', text: 'One hundred nights. Even the moon bows a little lower now.', when: (c) => c.event === 'nightStart' && c.night === 100 },

  // ---- Moon phases (first run under each) --------------------------------
  { id: 'phase-new',      text: 'Under the dark moon, the stars speak loudest.', when: (c) => c.event === 'nightStart' && c.isFirstPhase && c.moonPhase === 'new' },
  { id: 'phase-crescent', text: 'A sliver of moon, a sliver of mercy.', when: (c) => c.event === 'nightStart' && c.isFirstPhase && c.moonPhase === 'crescent' },
  { id: 'phase-half',     text: 'Half the moon, wholly the hunt.', when: (c) => c.event === 'nightStart' && c.isFirstPhase && c.moonPhase === 'half' },
  { id: 'phase-gibbous',  text: 'The moon grows bold, and so do you.', when: (c) => c.event === 'nightStart' && c.isFirstPhase && c.moonPhase === 'gibbous' },
  { id: 'phase-full',     text: 'The full moon does not forgive. Neither do you.', when: (c) => c.event === 'nightStart' && c.isFirstPhase && c.moonPhase === 'full' },

  // ---- Modes (first run of each) ------------------------------------------
  { id: 'mode-classic', text: 'The timeless hunt begins, again and always.', when: (c) => c.event === 'nightStart' && c.isFirstMode && c.mode === 'classic' },
  { id: 'mode-lantern', text: 'Sixty seconds. Eat the sky.', when: (c) => c.event === 'nightStart' && c.isFirstMode && c.mode === 'lantern' },
  { id: 'mode-zen',     text: 'No death tonight. Only drift.', when: (c) => c.event === 'nightStart' && c.isFirstMode && c.mode === 'zen' },

  // ---- Supernovas ----------------------------------------------------------
  { id: 'supernova-first',   text: 'A dying star chose you to carry its last light.', when: E('supernova') },
  { id: 'supernova-night-5', text: 'Five dying stars in one night. The sky is falling, and you are ready.', when: (c) => c.event === 'supernova' && c.nightStats.supernovas >= 5 },
  { id: 'supernova-25',      text: 'Twenty-five last lights gathered. You are a keeper of endings.', when: (c) => c.event === 'supernova' && c.totals.supernovas >= 25 },

  // ---- Planets ---------------------------------------------------------------
  { id: 'planet-100',    text: 'One hundred fallen stars, gathered one by one.', when: (c) => c.event === 'eat' && c.totals.planets >= 100 },
  { id: 'eat-10-night',  text: 'Ten stars in a single night — a constellation, assembled.', when: (c) => c.event === 'eat' && c.nightStats.planets >= 10 },

  // ---- Score milestones -------------------------------------------------------
  { id: 'score-25',  text: 'The lake ripples with your name.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.score >= 25 },
  { id: 'score-50',  text: 'Fifty lights. The garden holds its breath.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.score >= 50 },
  { id: 'score-100', text: 'One hundred lights. The moon leans closer to see.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.score >= 100 },
  { id: 'score-200', text: 'Two hundred. Somewhere, an astronomer weeps with joy.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.score >= 200 },

  // ---- Length milestones --------------------------------------------------------
  { id: 'length-15', text: 'Long enough to tie the night in a knot.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.length >= 15 },
  { id: 'length-25', text: 'Twenty-five segments of pure moonlight.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.length >= 25 },

  // ---- Deaths --------------------------------------------------------------------
  { id: 'death-wall-first', text: 'The jade fence is not a suggestion.', when: (c) => c.event === 'death' && c.cause === 'wall' },
  { id: 'death-self-first', text: 'You tied the final knot yourself.', when: (c) => c.event === 'death' && c.cause === 'self' },
  { id: 'death-time-first', text: 'You outlasted the clock. The feast was glorious.', when: (c) => c.event === 'death' && c.cause === 'time' },
  { id: 'death-10',          text: 'Ten endings. The lake keeps every single one.', when: (c) => c.event === 'death' && c.totals.deaths >= 10 },
  { id: 'moon-full-highrisk', text: 'The full moon takes what it is owed.', when: (c) => c.event === 'death' && (c.cause === 'wall' || c.cause === 'self') && c.moonPhase === 'full' },

  // ---- New best ---------------------------------------------------------------------
  { id: 'newbest-first', text: 'Tonight, you outshone every yesterday.', when: E('newBest') },

  // ---- Zen ------------------------------------------------------------------------------
  { id: 'zen-complete-first', text: 'You woke from the dream, and the dream stayed with you.', when: E('zenEnd') },
  { id: 'zen-score-30',       text: 'Even dreams can be bountiful.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.mode === 'zen' && c.score >= 30 },

  // ---- Lantern Rush ---------------------------------------------------------------------------
  { id: 'lantern-score-40', text: 'Forty stars in sixty seconds. The lanterns bow to you.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.mode === 'lantern' && c.score >= 40 },
  { id: 'lantern-feast',    text: 'A perfect feast: fifty stars before the last grain of time.', when: (c) => c.event === 'death' && c.cause === 'time' && c.score >= 50 },

  // ---- Quiet mastery -------------------------------------------------------------------------------
  { id: 'moon-new-calm', text: 'In darkness, you learned to see.', when: (c) => (c.event === 'eat' || c.event === 'supernova') && c.moonPhase === 'new' && c.score >= 20 },
  { id: 'dash-first',    text: 'Speed is a kind of prayer.', when: E('dash') },

  // ---- Completion ---------------------------------------------------------------------------------------
  { id: 'all-phases', text: 'You have danced with every face of the moon.', when: (c) => c.event === 'nightStart' && c.seenPhases.length >= 5 },
  { id: 'all-modes',  text: 'Hunter, guest, dreamer — you are all three.', when: (c) => c.event === 'nightStart' && c.seenModes.length >= 3 },
  { id: 'whispers-20', text: 'Twenty whispers. The night is telling you its secrets.', when: (c) => c.unlocked.length >= 20 },
]

export const WHISPER_IDS = WHISPERS.map((w) => w.id)
export const WHISPER_COUNT = WHISPERS.length

export function whisperById(id) {
  return WHISPERS.find((w) => w.id === id) || null
}

// Pure evaluation: which whispers unlock now, given the context?
// Returns the newly unlocked whisper objects (in definition order).
export function evaluateWhispers(ctx) {
  const has = new Set(ctx.unlocked || [])
  return WHISPERS.filter((w) => !has.has(w.id) && w.when(ctx))
}
