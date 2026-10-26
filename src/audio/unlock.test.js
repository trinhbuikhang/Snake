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
// way a real context reports them asynchronously. suspendAudio arms a
// pending timer that only fireSuspendTimer() can trip, so a test can
// prove a visible event cancelled it.
function fakeAudio() {
  const audio = {
    calls: [],
    ctxState: null,
    stateListener: null,
    pendingSuspend: false,
    unlockAudio() {
      audio.calls.push('unlock')
      if (audio.ctxState === null) audio.ctxState = 'suspended'
    },
    fadeOutAudio() {
      audio.calls.push('fadeOut')
    },
    suspendAudio() {
      audio.calls.push('suspend')
      audio.pendingSuspend = true
    },
    cancelPendingSuspend() {
      audio.calls.push('cancelSuspend')
      audio.pendingSuspend = false
    },
    restoreAudio() {
      audio.calls.push('restore')
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
    fireSuspendTimer() {
      if (!audio.pendingSuspend) return
      audio.pendingSuspend = false
      audio.calls.push('suspend-fired')
    },
  }
  return audio
}

describe('createAudioLifecycle (M01 wiring)', () => {
  let doc
  let win
  let audio
  let lc

  beforeEach(() => {
    doc = fakeDoc()
    win = fakeDoc()
    audio = fakeAudio()
    lc = createAudioLifecycle({ doc, win, audio })
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

  it('pagehide/pageshow live on window, not on document', () => {
    expect(doc.listeners['pagehide']).toBeUndefined()
    expect(doc.listeners['pageshow']).toBeUndefined()
    expect(win.listeners['pagehide'].length).toBe(1)
    expect(win.listeners['pageshow'].length).toBe(1)
    expect(doc.listeners['visibilitychange'].length).toBe(1)
  })

  it('a pagehide fired on document does nothing; on window it fades and suspends', () => {
    doc.fire('click')
    audio.emitState('running')
    audio.calls.length = 0
    doc.fire('pagehide') // the reported bug: document never receives the real event
    expect(audio.calls).toEqual([])
    win.fire('pagehide')
    expect(audio.calls).toEqual(['fadeOut', 'suspend'])
  })

  it('visible during the fade cancels the pending suspend and restores gain', () => {
    doc.fire('click')
    audio.emitState('running')
    doc.hidden = true
    doc.fire('visibilitychange')
    expect(audio.pendingSuspend).toBe(true)
    doc.hidden = false
    doc.fire('visibilitychange')
    expect(audio.calls).toContain('cancelSuspend')
    expect(audio.calls).toContain('restore')
    audio.fireSuspendTimer()
    expect(audio.calls).not.toContain('suspend-fired')
    expect(audio.pendingSuspend).toBe(false)
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
    win.fire('pagehide')
    audio.emitState('suspended')
    audio.calls.length = 0
    win.fire('pageshow')
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

  it('destroy removes every listener on both doc and win, and stops dispatching', () => {
    doc.fire('click')
    lc.destroy()
    for (const type of Object.keys(doc.listeners)) expect(doc.listeners[type].length).toBe(0)
    for (const type of Object.keys(win.listeners)) expect(win.listeners[type].length).toBe(0)
    expect(audio.stateListener).toBe(null)
    const before = audio.calls.length
    doc.fire('click')
    doc.fire('visibilitychange')
    win.fire('pagehide')
    win.fire('pageshow')
    expect(audio.calls.length).toBe(before)
  })

  it('works without a document or window (non-browser import)', () => {
    const noEnv = createAudioLifecycle({ doc: null, win: null, audio: fakeAudio() })
    expect(() => noEnv.destroy()).not.toThrow()
  })
})
