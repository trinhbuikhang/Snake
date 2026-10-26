// Audio unlock lifecycle, wired (M01). The pure reducer lives in
// musicState.js; this module owns the side effects: document activation
// listeners, visibility/pagehide/pageshow, and the context's onstatechange.
//
// Why this shape:
// - WebKit counts only pointerup/touchend/click/keydown as activation —
//   the old engine touchstart unlock never unlocked anything on iOS.
// - The activation listeners are attached while the context is NOT
//   running and removed once it is running, so a later interruption
//   (Teams iPhone) re-arms them and the next gesture resumes.
// - The layer never guesses: after every dispatch it syncs the listener
//   set against sound.js's real context state, and onstatechange feeds
//   the reducer so a silent interruption is visible to it.
// - No audioSession.type is set anywhere: the iPhone silent switch and
//   an ongoing Teams call/music are left alone by design.

import { audioLifecycle, initialAudioState } from './musicState.js'
import {
  unlockAudio,
  fadeOutAudio,
  suspendAudio,
  cancelPendingSuspend,
  setCtxStateListener,
  getCtxState,
} from './sound.js'

const ACTIVATION_EVENTS = ['pointerup', 'touchend', 'click', 'keydown']

const defaultAudio = {
  unlockAudio,
  fadeOutAudio,
  suspendAudio,
  cancelPendingSuspend,
  setCtxStateListener,
  getCtxState,
}

// doc defaults to the real document; tests inject a fake. In non-browser
// contexts (SSR, node tests importing this module) doc is null and the
// lifecycle is a harmless no-op that still accepts destroy().
export function createAudioLifecycle({
  doc = typeof document !== 'undefined' ? document : null,
  audio = defaultAudio,
} = {}) {
  let state = { ...initialAudioState }
  let destroyed = false
  let activationAttached = false

  const apply = (actions) => {
    for (const action of actions) {
      if (action === 'create' || action === 'resume') {
        audio.cancelPendingSuspend()
        audio.unlockAudio()
      } else if (action === 'fadeOut') {
        audio.fadeOutAudio()
      } else if (action === 'suspend') {
        audio.suspendAudio()
      }
    }
  }

  const attachActivation = () => {
    if (!doc || activationAttached) return
    for (const type of ACTIVATION_EVENTS) doc.addEventListener(type, onActivation, { capture: true })
    activationAttached = true
  }

  const detachActivation = () => {
    if (!doc || !activationAttached) return
    for (const type of ACTIVATION_EVENTS) doc.removeEventListener(type, onActivation, { capture: true })
    activationAttached = false
  }

  // Listeners follow the real context state: attached until running,
  // detached once running. A gesture while running is a reducer no-op,
  // so a stale attached listener costs nothing but is still removed.
  const syncListeners = () => {
    if (audio.getCtxState() === 'running') detachActivation()
    else attachActivation()
  }

  const dispatch = (event) => {
    if (destroyed) return
    const result = audioLifecycle(state, event)
    state = result.state
    apply(result.actions)
    syncListeners()
  }

  const onActivation = () => dispatch({ type: 'gesture' })

  const onVisibility = () => dispatch({ type: doc.hidden ? 'hidden' : 'visible' })

  const onPageHide = () => dispatch({ type: 'pagehide' })

  const onPageShow = () => dispatch({ type: 'pageshow' })

  const onCtxState = (ctxState) => dispatch({ type: 'ctxStateChange', state: ctxState })

  if (doc) {
    doc.addEventListener('visibilitychange', onVisibility)
    doc.addEventListener('pagehide', onPageHide)
    doc.addEventListener('pageshow', onPageShow)
  }
  audio.setCtxStateListener(onCtxState)
  // Start armed: with no context yet the first gesture must create one.
  attachActivation()
  syncListeners()

  return {
    destroy() {
      if (destroyed) return
      destroyed = true
      detachActivation()
      if (doc) {
        doc.removeEventListener('visibilitychange', onVisibility)
        doc.removeEventListener('pagehide', onPageHide)
        doc.removeEventListener('pageshow', onPageShow)
      }
      audio.setCtxStateListener(null)
    },
    // Test seam: the current reducer state (read-only snapshot).
    state: () => ({ ...state }),
  }
}
