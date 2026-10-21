// Serpent skins — pure data (no THREE, no DOM). The 3D builders
// live in three/skins/; the store owns ownership + selection
// persistence (ran-xinh-skin).
//
// Display names are English first ("Moon Jade") with the Vietnamese
// name as a small subtitle — the game targets a global audience.
//
// unlock is an OR-list of rules: satisfying any one rule owns the
// skin. { type: 'default' } is owned from the start. The moonlight
// and moonrise rules are only DECLARED here in S04 — S06 evaluates
// them (buySkin / milestone grants); until then a skin without a
// 'default' rule shows in the Garden picker as locked.
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
    unlock: [{ type: 'moonlight', cost: 800 }, { type: 'moonrise' }],
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
