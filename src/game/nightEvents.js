// Night Events — rare special nights ("đêm đặc biệt") with gameplay twists.
//
// Each night has a ~28% chance of being special. The event for the *next*
// night is rolled when a run starts, so the title screen can announce it
// ("Tonight: Meteor Shower") and build anticipation. Pure data — no
// React/Three/DOM, unit-testable in Node.

export const NIGHT_EVENTS = [
  {
    id: 'meteor', name: 'Meteor Shower',
    line: 'Tonight, the sky weeps meteors.',
    supernovaMult: 2.5, planetBonus: 0, speedMult: 1, fogMult: 1, weight: 8,
  },
  {
    id: 'fog', name: 'Thick Fog',
    line: 'A thick fog settles on the lake.',
    supernovaMult: 1, planetBonus: 1, speedMult: 1, fogMult: 1.9, weight: 6,
  },
  {
    id: 'tide', name: 'High Tide',
    line: 'The tide runs high and fast.',
    supernovaMult: 1, planetBonus: 1, speedMult: 1.12, fogMult: 1, weight: 6,
  },
  {
    id: 'silent', name: 'Silent Night',
    line: 'No dying stars tonight — every small light matters more.',
    supernovaMult: 0, planetBonus: 2, speedMult: 1, fogMult: 1, weight: 4,
  },
  {
    id: 'bloom', name: 'Bloom Tide',
    line: 'The garden blooms; the night slows to watch.',
    supernovaMult: 1, planetBonus: 1, speedMult: 0.92, fogMult: 1, weight: 4,
  },
  // P4 — the Moonrise Night. Never rolled by chance (weight 0); it is earned
  // by completing the Journey to the Moon and started deliberately.
  {
    id: 'moonrise', name: 'Moonrise Night',
    line: 'The moon leans close. The sky is about to rain stars.',
    supernovaMult: 4, planetBonus: 2, speedMult: 1, fogMult: 0.7, weight: 0,
  },
]

export const EVENT_IDS = NIGHT_EVENTS.map((e) => e.id)

// The default night: no twist. Kept as a full object so logic/engine can
// treat every night uniformly via nightEventById().
export const NONE_EVENT = {
  id: 'none', name: 'A Quiet Night',
  line: 'A quiet night. The lake mirrors the moon.',
  supernovaMult: 1, planetBonus: 0, speedMult: 1, fogMult: 1, weight: 0,
}

export function nightEventById(id) {
  return NIGHT_EVENTS.find((e) => e.id === id) || NONE_EVENT
}

// Weighted roll: ~28% of nights are special. `random` is injectable for tests.
export function rollNightEvent(random = Math.random) {
  const total = NIGHT_EVENTS.reduce((sum, e) => sum + e.weight, 0)
  if (random() * 100 >= total) return 'none'
  let r = random() * total
  for (const e of NIGHT_EVENTS) {
    r -= e.weight
    if (r < 0) return e.id
  }
  return 'none'
}
