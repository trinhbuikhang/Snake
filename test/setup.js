// Vitest setup: the game store persists state to localStorage, which the
// Node test environment does not provide. Install a tiny in-memory stub
// before any test module imports the store. Tests clear it in beforeEach
// when they need a pristine profile.
class LocalStorageStub {
  #map = new Map()

  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null
  }

  setItem(key, value) {
    this.#map.set(String(key), String(value))
  }

  removeItem(key) {
    this.#map.delete(key)
  }

  clear() {
    this.#map.clear()
  }
}

globalThis.localStorage = new LocalStorageStub()
