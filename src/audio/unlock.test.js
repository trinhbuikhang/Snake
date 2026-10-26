import { describe, it, expect, beforeEach } from 'vitest'
import { createAudioLifecycle } from './unlock.js'

// Fake document: records listeners per type (with options) and fires them.
function fakeDoc() {
  const listeners = {}
  return {
    hidden: false,
    listeners,
    addEventListener(type, fn, opts) {
      ;(listeners[type] ||= []).push({ fn, opts })
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((l) => l.fn !== fn)
    },
    fire(type) {
      for (const { fn } of [...(listeners[type] || [])]) fn()
    },
  }
}

// Fake sound layer: unlockAudio creates a suspended context on first use;
// state changes arrive through the captured onstatechange callback, the
// way a real context reports them asynchronously.
function fakeAudio() {
  const audio = {
    calls: [],
    ctxState: null,
    stateListener: null,
    unlockAudio() {
      audio.calls.push('unlock')
      if (audio.ctxState === null) audio.ctxState = 'suspended'
    },
    fadeOutAudio() {
      audio.calls.push('fadeOut')
    },
    suspendAudio() {
      audio.calls.push('suspend')
    },
    cancelPendingSuspend() {
      audio.calls.push('cancelSuspend')
    },
    setCtxStateListener(cb) {
      audio.stateListener = cb
    },
    getCtxState() {
      return audio.ctxState
    },
    emitState(s) {
      audio.ctxState = s
      if (audio.stateListener) audio.stateListener(s)
    },
  }
  return audio
}

describe('createAudioLifecycle (M01 wiring)', () => {
  let doc
  let audio
  let lc

  beforeEach(() => {
    doc = fakeDoc()
    audio = fakeAudio()
    lc = createAudioLifecycle({ doc, audio })
  })

  it('attaches activation listeners with capture, and unlocks on the first gesture', () => {
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      expect(doc.listeners[type].length).toBe(1)
      expect(doc.listeners[type][0].opts).toEqual({ capture: true })
    }
    doc.fire('pointerup')
    expect(audio.calls).toContain('unlock')
    expect(audio.calls).not.toContain('fadeOut')
    expect(audio.calls).not.toContain('suspend')
  })

  it('detaches activation listeners once running; a gesture then is a no-op', () => {
    doc.fire('touchend')
    const before = audio.calls.length
    audio.emitState('running')
    expect(doc.listeners['touchend'].length).toBe(0)
    doc.fire('touchend')
    expect(audio.calls.length).toBe(before)
  })

  it('hidden while running -> fadeOut then suspend, in order', () => {
    doc.fire('click')
    audio.emitState('running')
    audio.calls.length = 0
    doc.hidden = true
    doc.fire('visibilitychange')
    expect(audio.calls).toEqual(['fadeOut', 'suspend'])
  })

  it('visible resumes when wanted; pageshow resumes after bfcache', () => {
    doc.fire('click')
    audio.emitState('running')
    doc.hidden = true
    doc.fire('visibilitychange')
    audio.emitState('suspended')
    audio.calls.length = 0
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(audio.calls).toContain('unlock')
    audio.calls.length = 0
    doc.hidden = true
    doc.fire('pagehide')
    audio.emitState('suspended')
    audio.calls.length = 0
    doc.fire('pageshow')
    expect(audio.calls).toContain('unlock')
  })

  it("interrupted + gesture -> resume without fade/suspend; listeners re-arm on interrupt", () => {
    doc.fire('click')
    audio.emitState('running')
    expect(doc.listeners['click'].length).toBe(0)
    audio.emitState('interrupted')
    expect(doc.listeners['click'].length).toBe(1)
    audio.calls.length = 0
    doc.fire('click')
    // Resume cancels any pending hide-suspend first, then unlocks.
    expect(audio.calls).toEqual(['cancelSuspend', 'unlock'])
  })

  it('destroy removes every listener and stops dispatching', () => {
    doc.fire('click')
    lc.destroy()
    for (const type of Object.keys(doc.listeners)) expect(doc.listeners[type].length).toBe(0)
    expect(audio.stateListener).toBe(null)
    const before = audio.calls.length
    doc.fire('click')
    doc.fire('visibilitychange')
    expect(audio.calls.length).toBe(before)
  })

  it('works without a document (non-browser import)', () => {
    const noDoc = createAudioLifecycle({ doc: null, audio: fakeAudio() })
    expect(() => noDoc.destroy()).not.toThrow()
  })
})
