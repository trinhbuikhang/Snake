// REFERENCE PROTOTYPE — not part of src/. Port it into PR-sized tasks per docs/plan/SKINS_PERF_PLAN.md.
// Serpent skins — pure data (no THREE, no DOM). The 3D builders live in
// three/skins/; the store owns ownership + selection persistence.
//
// unlock: { type: 'default' } is owned from the start. Other rule types are
// placeholders for the economy (e.g. { type: 'moonlight', cost }, or
// { type: 'journey', completed }) — canUnlockSkin() is the single place to
// implement them. For now every skin is unlocked.
export const SKINS = [
  {
    id: 'moonJade',
    name: 'Ngọc trăng',
    en: 'Moon Jade',
    desc: 'Pearly white jade with moonstone beads along the spine.',
    unlock: { type: 'default' },
    swatch: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e6eee8 45%, #bfe6d3 80%), #e6eee8',
    accent: 'radial-gradient(circle, #f3e9ff 0%, #c9b6f0 70%)',
  },
  {
    id: 'plushMoon',
    name: 'Gấu bông',
    en: 'Plush Moon',
    desc: 'A soft felt plush with gold-stitched stars and a crescent moon.',
    unlock: { type: 'placeholder', cost: 0 },
    swatch: 'linear-gradient(180deg, #8cc2ee 0%, #8cc2ee 58%, #f7f0e2 60%, #f7f0e2 100%)',
    accent: 'radial-gradient(circle, #ffe7a6 0%, #e2bd68 70%)',
  },
]

export const SKIN_IDS = SKINS.map((s) => s.id)
export const DEFAULT_SKIN = 'moonJade'

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0]
}

// Placeholder unlock rule: default skins and (for now) every placeholder rule pass.
// eslint-disable-next-line no-unused-vars
export function canUnlockSkin(skin, state) {
  if (!skin) return false
  if (skin.unlock.type === 'default') return true
  return true
}
