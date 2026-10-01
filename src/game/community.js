// Community Sky — "Bầu trời chung" (P5 Shared Skies).
//
// One sky shared by every gardener: each ISO week picks a single night event
// deterministically, so all players worldwide play under the same sky that
// week and can discover the same shared verse. No server needed — the week
// id is the seed.
//
// Pure data + pure functions: no React/Three/DOM, unit-testable in Node.

import { nightEventById } from './nightEvents.js'

// Events eligible to be the week's shared sky. Moonrise (weight 0, earned)
// is excluded — the shared sky is a rolled event anyone can meet.
export const COMMUNITY_EVENT_IDS = ['meteor', 'fog', 'tide', 'silent', 'bloom']

// "2026-W40" style id for the ISO week containing `date`.
export function isoWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // ISO week: Thursday of the current week determines the week-year.
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3)
  const year = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day)
  const week = 1 + Math.round((d - week1Monday) / (7 * 24 * 3600 * 1000))
  return `${year}-W${String(week).padStart(2, '0')}`
}

// FNV-1a 32-bit hash — tiny, deterministic, good enough for a weekly pick.
export function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// The shared event id for a week id, e.g. communityEventForWeek('2026-W40').
export function communityEventForWeek(weekId) {
  const seed = hashSeed(`moonlit-serpent:${weekId}`)
  return COMMUNITY_EVENT_IDS[seed % COMMUNITY_EVENT_IDS.length]
}

// Convenience: { weekId, eventId, event } for "now".
export function currentCommunitySky(date = new Date()) {
  const weekId = isoWeekId(date)
  const eventId = communityEventForWeek(weekId)
  return { weekId, eventId, event: nightEventById(eventId) }
}
