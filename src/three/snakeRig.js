// Serpent rig entry point: builds the rig for a skin id (see
// skins/). Skin data (ids, default, unlock rules) lives in
// game/skins.js. Debug only: ?rig=old restores the original
// pearl rig.
import { SKIN_RIGS } from './skins/index.js'
import { createSnakeRig as createOldPearls } from './snakeRig.old.js'
import { DEFAULT_SKIN } from '../game/skins.js'

export function isDebugOldRig() {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('rig') === 'old'
}

export function createSnakeRig(scene, skinId = DEFAULT_SKIN) {
  if (isDebugOldRig()) return createOldPearls(scene)
  return (SKIN_RIGS[skinId] || SKIN_RIGS[DEFAULT_SKIN])(scene)
}
