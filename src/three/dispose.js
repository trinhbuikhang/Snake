// Dispose every GPU resource in an Object3D subtree, exactly once each
// (T08). Pure bookkeeping — no renderer, no DOM — so it is unit-testable
// with plain fake objects: anything with a traverse(cb) that yields
// nodes carrying geometry / material works.
//
// Shared resources are common in the garden (one geometry instanced
// across lanterns, one material across petals), so geometries,
// materials and textures are gathered into Sets first and disposed a
// single time. Textures are collected from the materials' own
// properties (map, normalMap, emissiveMap, ... — any value flagged
// isTexture). Material arrays are handled.
export function disposeObject3D(root) {
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()

  const collectMaterial = (material) => {
    if (!material || materials.has(material)) return
    materials.add(material)
    for (const value of Object.values(material)) {
      if (value && value.isTexture) textures.add(value)
    }
  }

  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry)
    if (Array.isArray(obj.material)) obj.material.forEach(collectMaterial)
    else collectMaterial(obj.material)
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}
