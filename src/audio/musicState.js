// Pure audio lifecycle + music target (M01). No DOM, no Web Audio here —
// the wiring layer (unlock.js) owns the listeners and calls sound.js, and
// M04's applyMusic will own the fades. Everything below is unit-testable
// in Node with no mocks.

// Reducer state:
//   gestured    — a real activation event has happened (WebKit only counts
//                 pointerup/touchend/click/keydown, never touchstart)
//   ctxState    — null before any AudioContext exists, else the context's
//                 state ('suspended' | 'running' | 'interrupted' | 'closed')
//   hidden      — the page is hidden (visibilitychange) or pagehidden
//   wantRunning — the user has gestured and sound is wanted back whenever
//                 the page is visible again (survives hidden/visible)
export const initialAudioState = {
  gestured: false,
  ctxState: null,
  hidden: false,
  wantRunning: false,
}

// audioLifecycle(state, event) -> { state, actions }.
// Actions the wiring layer executes, in order:
//   'create'   — create the AudioContext (only ever after a gesture)
//   'resume'   — ctx.resume()
//   'fadeOut'  — ramp the master bus to silence over 0.2s
//   'suspend'  — ctx.suspend() once the fade has finished
export function audioLifecycle(state, event) {
  switch (event.type) {
    case 'gesture': {
      // A gesture while already running changes nothing — this is the
      // steady state the activation listeners detach on.
      if (state.ctxState === 'running') return { state, actions: [] }
      const next = { ...state, gestured: true, wantRunning: true }
      if (state.ctxState === null) {
        // First gesture ever: create, then resume — except while hidden,
        // where creating is fine but resuming would sound into a hidden
        // tab; the later visible/pageshow event resumes instead.
        return { state: next, actions: state.hidden ? ['create'] : ['create', 'resume'] }
      }
      // Context exists but is not running (suspended, interrupted, or
      // closed-and-recreated): a gesture is the one thing that is
      // allowed to wake it. While hidden, stay silent until visible.
      return { state: next, actions: state.hidden ? [] : ['resume'] }
    }
    case 'hidden':
    case 'pagehide': {
      const next = { ...state, hidden: true }
      // Only a running context has anything to fade and suspend; a
      // suspended/interrupted one is already silent, and with no context
      // yet there is nothing to do at all.
      if (state.ctxState !== 'running') return { state: next, actions: [] }
      return { state: next, actions: ['fadeOut', 'suspend'] }
    }
    case 'visible':
    case 'pageshow': {
      const next = { ...state, hidden: false }
      // Resume only if sound is wanted and a non-running context exists.
      // If the browser blocks the resume (no recent gesture), the next
      // gesture's 'resume' action is the fallback — the wiring layer
      // keeps its activation listeners attached until running.
      if (!state.wantRunning || state.ctxState === null || state.ctxState === 'running') {
        return { state: next, actions: [] }
      }
      return { state: next, actions: ['resume'] }
    }
    case 'ctxStateChange': {
      return { state: { ...state, ctxState: event.state }, actions: [] }
    }
    default:
      return { state, actions: [] }
  }
}

// musicTarget: which music mode the game wants, purely from state.
// M02 will scale `gain` by the music volume and M03 caps the bus at
// 0.25; the `gain` here is the arrangement's own level — menu sits at
// 0.7 of play (M04 decision), so the ceiling bus lands at 0.175 for
// menu and 0.25 for play/moonrise.
//   status: 'title' | 'prologue' | 'ready' | 'playing' | 'paused' | 'dead'
//   nightEvent: 'none' | 'silent' | 'moonrise' | ... (store values)
//   moonrise: the moonrise-night flag (also true when nightEvent is
//     'moonrise', since the store folds it into nightEvent on start)
//   deadMs: milliseconds since death — the ring-out holds the run's
//     arrangement for 2s before falling back to 'menu' (M04 wires the
//     timer; the engine overrides the dead mode with the run's
//     arrangement, see applyRunAudio)
export function musicTarget({
  gestured,
  musicOn,
  muted,
  status,
  nightEvent,
  moonrise,
  hidden,
  deadMs = 0,
} = {}) {
  // Never any music before the first gesture, while muted, while the
  // music toggle is off, or while the tab is hidden.
  if (!gestured || muted || musicOn === false || hidden) return { mode: 'off', gain: 0 }
  // Round-1 review (M04): the title screen is not a run state, so a
  // Silent Night left over from the last run must not silence it —
  // the Silent rule applies to run states only.
  if (status === 'title') return { mode: 'menu', gain: 0.7 }
  // Silent Night keeps its promise: water only, no music.
  if (nightEvent === 'silent') return { mode: 'off', gain: 0 }
  const moon = moonrise === true || nightEvent === 'moonrise'
  switch (status) {
    case 'prologue':
      return { mode: 'menu', gain: 0.7 }
    case 'ready':
    case 'playing':
      return { mode: moon ? 'moonrise' : 'play', gain: 1 }
    case 'paused':
      return { mode: 'off', gain: 0 }
    case 'dead':
      return deadMs < 2000 ? { mode: 'play', gain: 1 } : { mode: 'menu', gain: 0.7 }
    default:
      return { mode: 'off', gain: 0 }
  }
}
