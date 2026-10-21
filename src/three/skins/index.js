// Skin rig registry (3D side). Skin data (names, unlock rules) will
// live in game/skins.js from S04; S03 adds plushMoon here.
import { createMoonJadeRig } from './moonJade.js'

export const SKIN_RIGS = {
  moonJade: createMoonJadeRig,
}
