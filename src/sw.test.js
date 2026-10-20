import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

// Service-worker strategy tests (T07). public/sw.js is a plain script
// that registers listeners on `self`; these tests install in-memory
// `caches` / `fetch` / `self` stubs, load the real file, and drive its
// fetch handler with fake events — so the strategy itself (not a copy
// of it) is what gets verified.

const ORIGIN = 'https://garden.test'
const store = new Map() // cache name -> Map(key -> response)
let fetchImpl = async () => {
  throw new Error('fetch not stubbed for this test')
}

function makeResponse(body, { status = 200, type = 'basic' } = {}) {
  return {
    status,
    type,
    body,
    clone() {
      return makeResponse(body, { status, type })
    },
  }
}

const keyOf = (req) => (typeof req === 'string' ? req : req.url)

class FakeCache {
  constructor(name) {
    if (!store.has(name)) store.set(name, new Map())
    this.map = store.get(name)
  }

  async match(req) {
    const hit = this.map.get(keyOf(req))
    return hit ? hit.clone() : undefined
  }

  async put(req, res) {
    this.map.set(keyOf(req), res)
  }

  async addAll(urls) {
    for (const u of urls) this.map.set(u, makeResponse(`core:${u}`))
  }
}

const cachesStub = {
  async open(name) {
    return new FakeCache(name)
  },
  async keys() {
    return [...store.keys()]
  },
  async delete(name) {
    return store.delete(name)
  },
  async match(req) {
    for (const cache of store.values()) {
      const hit = cache.get(keyOf(req))
      if (hit) return hit.clone()
    }
    return undefined
  },
}

const listeners = {}

beforeAll(async () => {
  globalThis.self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn
    },
    location: { origin: ORIGIN },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  }
  globalThis.caches = cachesStub
  globalThis.fetch = (req) => fetchImpl(req)
  await import('../public/sw.js')
})

beforeEach(() => {
  store.clear()
})

const flush = () => new Promise((r) => setTimeout(r, 0))

async function runInstall() {
  const waits = []
  listeners.install({ waitUntil: (p) => waits.push(p) })
  await Promise.all(waits)
  await flush()
}

function fetchEvent(url, mode = 'same-origin') {
  const event = {
    request: { url, method: 'GET', mode },
    waits: [],
    response: null,
    respondWith(p) {
      this.response = p
    },
    waitUntil(p) {
      this.waits.push(p)
    },
  }
  listeners.fetch(event)
  return event
}

describe('service worker strategy', () => {
  it('precaches the core shell under the v4 cache name', async () => {
    await runInstall()
    expect(await cachesStub.keys()).toEqual(['moonlit-serpent-v4'])
    const shell = await cachesStub.match('./index.html')
    expect(shell.body).toBe('core:./index.html')
  })

  it('serves hashed assets cache-first: the network is not asked again', async () => {
    const asset = `${ORIGIN}/assets/index-a1b2c3.js`
    let calls = 0
    fetchImpl = async () => {
      calls += 1
      return makeResponse(`bundle-v${calls}`)
    }
    const first = await fetchEvent(asset).response
    expect(first.body).toBe('bundle-v1')
    await flush() // let the cache.put land
    const second = await fetchEvent(asset).response
    expect(second.body).toBe('bundle-v1') // cached copy wins
    expect(calls).toBe(1)
  })

  it('serves unhashed files stale-while-revalidate: stale now, fresh next visit', async () => {
    // The AUDIT M3 scenario: deploy a new manifest without a CACHE bump.
    const manifest = `${ORIGIN}/manifest.webmanifest`
    fetchImpl = async () => makeResponse('manifest-v1')
    const first = await fetchEvent(manifest).response
    expect(first.body).toBe('manifest-v1')
    await flush()

    fetchImpl = async () => makeResponse('manifest-v2') // "deployed" change
    const secondEvent = fetchEvent(manifest)
    const second = await secondEvent.response
    expect(second.body).toBe('manifest-v1') // stale copy answers immediately
    await Promise.all(secondEvent.waits) // background revalidation lands
    await flush()

    const third = await fetchEvent(manifest).response
    expect(third.body).toBe('manifest-v2') // refreshed copy on the next visit
  })

  it('navigations are network-first and fall back to the cached shell offline', async () => {
    await runInstall()
    fetchImpl = async () => makeResponse('fresh-shell')
    const online = await fetchEvent(`${ORIGIN}/`, 'navigate').response
    expect(online.body).toBe('fresh-shell')

    fetchImpl = async () => {
      throw new Error('offline')
    }
    const offline = await fetchEvent(`${ORIGIN}/`, 'navigate').response
    expect(offline.body).toBe('core:./index.html')
  })

  it('ignores cross-origin requests entirely', async () => {
    const event = fetchEvent('https://elsewhere.example/lib.js')
    expect(event.response).toBeNull()
  })
})
