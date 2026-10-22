// Serpent skins — pure data (no THREE, no DOM). The 3D builders
// live in three/skins/; the store owns ownership + selection
// persistence (ran-xinh-skin).
//
// Display names are English first ("Moon Jade") with the Vietnamese
// name as a small subtitle — the game targets a global audience.
//
// unlock is an OR-list of rules: satisfying any one rule owns the
// skin. { type: 'default' } is owned from the start;
// { type: 'moonlight', cost } can be bought in the Garden with
// moonlight; { type: 'milestone', id } is granted free when the
// milestone is met (see skinUnlockState / checkSkinMilestones).
// Adding a skin = one entry here + one builder in three/skins/ +
// one registry line there; the store and picker need no changes.
export const SKINS = [
  {
    id: 'moonJade',
    name: 'Moon Jade',
    nameVi: 'Ngọc trăng',
    desc: 'Pearly white jade with moonstone beads along the spine.',
    unlock: [{ type: 'default' }],
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e6eee8 45%, #bfe6d3 80%), #e6eee8',
    accent: 'radial-gradient(circle, #f3e9ff 0%, #c9b6f0 70%)',
  },
  {
    id: 'plushMoon',
    name: 'Plush Moon',
    nameVi: 'Gấu bông',
    desc: 'A soft felt plush with gold-stitched stars and a crescent moon.',
    unlock: [{ type: 'moonlight', cost: 800 }, { type: 'milestone', id: 'first-moonrise' }],
    swatch: 'linear-gradient(180deg, #8cc2ee 0%, #8cc2ee 58%, #f7f0e2 60%, #f7f0e2 100%)',
    accent: 'radial-gradient(circle, #ffe7a6 0%, #e2bd68 70%)',
  },
]

export const SKIN_IDS = SKINS.map((s) => s.id)
export const DEFAULT_SKIN = 'moonJade'

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0]
}

// Owned from the start (a 'default' rule in the OR-list).
export function isDefaultSkin(skin) {
  return skin.unlock.some((rule) => rule.type === 'default')
}

export const SKIN_UNLOCK_TYPES = ['default', 'moonlight', 'milestone']

// Milestones a skin rule can name. 'first-moonrise': the player
// has completed at least one Moonrise Night (journey.completed).
function milestoneMet(id, ctx) {
  if (id === 'first-moonrise') return (ctx?.journeyCompleted ?? 0) >= 1
  return false
}

// The unlock state of one skin for a player context
// ctx = { owned: [ids], balance, journeyCompleted }.
// Returns { owned, buyable, cost, reasons }:
// - owned: already in ctx.owned, or granted by a satisfied
//   'default' / 'milestone' rule.
// - cost: the moonlight price from its rule, else null.
// - buyable: not owned, has a price, and the balance covers it.
// - reasons: the satisfied paths ('default',
//   'milestone:first-moonrise', 'moonlight' when buyable) — the
//   picker uses them to explain the card's state.
export function skinUnlockState(skin, ctx) {
  const ownedList = ctx?.owned ?? []
  let cost = null
  let granted = false
  const reasons = []
  for (const rule of skin.unlock) {
    if (rule.type === 'default') {
      granted = true
      reasons.push('default')
    } else if (rule.type === 'moonlight') {
      cost = rule.cost
    } else if (rule.type === 'milestone' && milestoneMet(rule.id, ctx)) {
      granted = true
      reasons.push(`milestone:${rule.id}`)
    }
  }
  const owned = ownedList.includes(skin.id) || granted
  const buyable = !owned && cost != null && (ctx?.balance ?? 0) >= cost
  if (buyable) reasons.push('moonlight')
  return { owned, buyable, cost, reasons }
}

// Skin ids a milestone has just unlocked for this player: not yet
// owned, with a satisfied milestone rule. The store calls this
// when a Moonrise Night completes (and at hydrate, for players
// who finished one before skins could be granted).
export function checkSkinMilestones(ctx) {
  const ownedList = ctx?.owned ?? []
  return SKINS.filter(
    (skin) =>
      !ownedList.includes(skin.id) &&
      skin.unlock.some((rule) => rule.type === 'milestone' && milestoneMet(rule.id, ctx)),
  ).map((skin) => skin.id)
}
