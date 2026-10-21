// Serpent rig entry point: builds the rig for a skin id (see
// skins/). Debug only: ?rig=old restores the original pearl rig.
import { SKIN_RIGS } from './skins/index.js'
import { createSnakeRig as createOldPearls } from './snakeRig.old.js'

// Skin data (ids, default, unlock rules) moves to game/skins.js in
// S04; until then moonJade is the only skin and the default.
const DEFAULT_SKIN_ID = 'moonJade'

export function isDebugOldRig() {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('rig') === 'old'
}

export function createSnakeRig(scene, skinId = DEFAULT_SKIN_ID) {
  if (isDebugOldRig()) return createOldPearls(scene)
  return (SKIN_RIGS[skinId] || SKIN_RIGS[DEFAULT_SKIN_ID])(scene)
}
