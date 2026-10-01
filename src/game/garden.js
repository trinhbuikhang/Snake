// P4 "The Garden Remembers": pure data + formulas for the Moonlight
// economy, the visible garden, the lunar streak, and the Journey to the Moon.
// No DOM, no THREE, no localStorage here — the store owns persistence.

export const MOONLIGHT_GLYPH = '☾'

// --- Snake inks -------------------------------------------------------------
// emissive/ridge tint the serpent's glow in 3D. 'jade' is the original look.
export const INKS = [
  { id: 'jade', name: 'Jade Ink', cost: 0,
    emissive: 0xd47585, ridge: 0xffe082,
    desc: 'The serpent as the lake remembers.' },
  { id: 'gold', name: 'Gold Ink', cost: 500,
    emissive: 0xffb300, ridge: 0xffd54f,
    desc: 'For nights that deserve a little ceremony.' },
  { id: 'crimson', name: 'Crimson Ink', cost: 900,
    emissive: 0xff2b4e, ridge: 0xff8a80,
    desc: 'A bolder stroke across the dark.' },
  { id: 'abyss', name: 'Abyss Ink', cost: 1400,
    emissive: 0x3b5bff, ridge: 0x9ecbff,
    desc: 'Deep water, deeper glow.' },
]

export const INK_IDS = INKS.map((i) => i.id)

export function inkById(id) {
  return INKS.find((i) => i.id === id) || INKS[0]
}

// --- Lanterns & lotus blooms ------------------------------------------------
// Tiers are cumulative: buying tier N lights the tier-N count. Costs are the
// price to reach that tier from the previous one.
export const LANTERN_TIERS = [4, 8, 12, 16]
export const LANTERN_COSTS = [0, 300, 800, 1500]
export const LANTERN_MAX_TIER = LANTERN_TIERS.length - 1

export const BLOOM_TIERS = [0, 3, 6, 9]
export const BLOOM_COSTS = [0, 250, 700, 1300]
export const BLOOM_MAX_TIER = BLOOM_TIERS.length - 1

export function lanternCount(tier) {
  return LANTERN_TIERS[Math.max(0, Math.min(LANTERN_MAX_TIER, tier || 0))]
}

export function bloomCount(tier) {
  return BLOOM_TIERS[Math.max(0, Math.min(BLOOM_MAX_TIER, tier || 0))]
}

// --- Moonlight earning ------------------------------------------------------
// Earned at the end of every night. Generous by design: the garden should
// feel like it remembers, not like it bills.
const MODE_MULT = { classic: 1, lantern: 1.2, zen: 0.8 }
const PHASE_MULT = { new: 1.25, crescent: 1.1, half: 1, gibbous: 1.25, full: 1.5 }

export function earnMoonlight({ score = 0, mode = 'classic', moonPhase = 'half', isNewBest = false, streak = 0, moonrise = false } = {}) {
  const modeMult = MODE_MULT[mode] ?? 1
  const phaseMult = PHASE_MULT[moonPhase] ?? 1
  // Lunar streak: +10% per consecutive day, capped at +50%. Gentle — a
  // broken streak simply stops the bonus, it never punishes.
  const streakMult = 1 + Math.min(Math.max(0, streak), 5) * 0.1
  let ml = score * modeMult * phaseMult * streakMult
  if (isNewBest) ml *= 1.5
  if (moonrise) ml *= 1.25
  return Math.max(1, Math.round(ml))
}

// --- Lunar streak -----------------------------------------------------------
// Pure over YYYY-MM-DD strings so tests don't depend on the clock.
// Returns null when today was already counted.
export function nextStreak(prev, today) {
  const lastDay = prev?.lastDay || null
  if (!today || lastDay === today) return null // already counted today
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - 1)
  const yesterday = toDayString(d)
  const continued = lastDay === yesterday
  return { count: continued ? (prev?.count || 0) + 1 : 1, lastDay: today }
}

export function toDayString(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// --- Journey to the Moon ----------------------------------------------------
// Ascension accumulates 1:1 with earned moonlight. A full bar unlocks one
// Moonrise Night; completing it grants a keepsake and the bar waxes again.
export const JOURNEY_GOAL = 3000

export function journeyReady(progress) {
  return (progress || 0) >= JOURNEY_GOAL
}
