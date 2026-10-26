import { describe, it, expect } from 'vitest'
import { audioLifecycle, initialAudioState, musicTarget } from './musicState.js'

const run = (events, start = initialAudioState) => {
  let state = start
  let all = []
  for (const ev of events) {
    const r = audioLifecycle(state, ev)
    state = r.state
    all = all.concat(r.actions)
  }
  return { state, actions: all }
}

describe('audioLifecycle reducer (M01 acceptance)', () => {
  it('never emits create before a gesture', () => {
    for (const ev of [
      { type: 'hidden' },
      { type: 'visible' },
      { type: 'pagehide' },
      { type: 'pageshow' },
      { type: 'ctxStateChange', state: 'suspended' },
    ]) {
      expect(audioLifecycle(initialAudioState, ev).actions).not.toContain('create')
    }
    expect(run([{ type: 'hidden' }, { type: 'visible' }, { type: 'pageshow' }]).actions).toEqual([])
  })

  it('gesture -> create + resume', () => {
    const { state, actions } = run([{ type: 'gesture' }])
    expect(actions).toEqual(['create', 'resume'])
    expect(state.gestured).toBe(true)
    expect(state.wantRunning).toBe(true)
  })

  it("ctxStateChange('interrupted') + gesture -> resume, no create", () => {
    const { actions } = run([
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'interrupted' },
      { type: 'gesture' },
    ])
    expect(actions).toEqual(['create', 'resume', 'resume'])
  })

  it('hidden while running -> fadeOut then suspend, in order', () => {
    const { state, actions } = run([
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'running' },
      { type: 'hidden' },
    ])
    expect(actions).toEqual(['create', 'resume', 'fadeOut', 'suspend'])
    expect(state.hidden).toBe(true)
    // wantRunning survives the hide so visible can resume.
    expect(state.wantRunning).toBe(true)
  })

  it('hidden while suspended or without a context -> no actions', () => {
    expect(
      run([{ type: 'gesture' }, { type: 'ctxStateChange', state: 'suspended' }, { type: 'hidden' }]).actions,
    ).toEqual(['create', 'resume'])
    expect(run([{ type: 'hidden' }]).actions).toEqual([])
  })

  it('visible -> resume if wantRunning', () => {
    const { actions } = run([
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'running' },
      { type: 'hidden' },
      { type: 'ctxStateChange', state: 'suspended' },
      { type: 'visible' },
    ])
    expect(actions).toEqual(['create', 'resume', 'fadeOut', 'suspend', 'resume'])
  })

  it('visible without wantRunning, or while running, -> no resume', () => {
    expect(run([{ type: 'visible' }]).actions).toEqual([])
    expect(
      run([{ type: 'gesture' }, { type: 'ctxStateChange', state: 'running' }, { type: 'visible' }]).actions,
    ).toEqual(['create', 'resume'])
  })

  it('pageshow after bfcache -> resume', () => {
    const { actions } = run([
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'running' },
      { type: 'pagehide' },
      { type: 'ctxStateChange', state: 'suspended' },
      { type: 'pageshow' },
    ])
    expect(actions).toEqual(['create', 'resume', 'fadeOut', 'suspend', 'resume'])
  })

  it('repeated gesture while running -> no actions', () => {
    const { actions } = run([
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'running' },
      { type: 'gesture' },
      { type: 'gesture' },
    ])
    expect(actions).toEqual(['create', 'resume'])
  })

  it('gesture while hidden creates but does not resume into a hidden tab', () => {
    const { actions } = run([{ type: 'hidden' }, { type: 'gesture' }])
    expect(actions).toEqual(['create'])
    // Once the layer reports the new context's state back, visible resumes.
    const resumed = run([
      { type: 'hidden' },
      { type: 'gesture' },
      { type: 'ctxStateChange', state: 'suspended' },
      { type: 'visible' },
    ])
    expect(resumed.actions).toEqual(['create', 'resume'])
  })

  it('unknown events are no-ops', () => {
    const r = audioLifecycle(initialAudioState, { type: 'nonsense' })
    expect(r.actions).toEqual([])
    expect(r.state).toEqual(initialAudioState)
  })
})

describe('musicTarget table (M01, wired by M04)', () => {
  const base = { gestured: true, musicOn: true, muted: false, hidden: false, nightEvent: 'none' }
  it('never menu/play before the first gesture', () => {
    for (const status of ['title', 'prologue', 'ready', 'playing', 'dead']) {
      expect(musicTarget({ ...base, gestured: false, status }).mode).toBe('off')
    }
  })
  it('title/prologue -> menu; ready/playing -> play; paused -> off', () => {
    expect(musicTarget({ ...base, status: 'title' })).toEqual({ mode: 'menu', gain: 1 })
    expect(musicTarget({ ...base, status: 'prologue' })).toEqual({ mode: 'menu', gain: 1 })
    expect(musicTarget({ ...base, status: 'ready' })).toEqual({ mode: 'play', gain: 1 })
    expect(musicTarget({ ...base, status: 'playing' })).toEqual({ mode: 'play', gain: 1 })
    expect(musicTarget({ ...base, status: 'paused' })).toEqual({ mode: 'off', gain: 0 })
  })
  it('moonrise flag or nightEvent moonrise -> moonrise in play states only', () => {
    expect(musicTarget({ ...base, status: 'playing', moonrise: true })).toEqual({ mode: 'moonrise', gain: 1 })
    expect(musicTarget({ ...base, status: 'playing', nightEvent: 'moonrise' })).toEqual({
      mode: 'moonrise',
      gain: 1,
    })
    expect(musicTarget({ ...base, status: 'title', moonrise: true })).toEqual({ mode: 'menu', gain: 1 })
  })
  it('Silent Night -> off in every status', () => {
    for (const status of ['title', 'ready', 'playing', 'dead']) {
      expect(musicTarget({ ...base, status, nightEvent: 'silent' }).mode).toBe('off')
    }
  })
  it('dead holds play for 2s, then menu', () => {
    expect(musicTarget({ ...base, status: 'dead', deadMs: 0 })).toEqual({ mode: 'play', gain: 1 })
    expect(musicTarget({ ...base, status: 'dead', deadMs: 1999 })).toEqual({ mode: 'play', gain: 1 })
    expect(musicTarget({ ...base, status: 'dead', deadMs: 2000 })).toEqual({ mode: 'menu', gain: 1 })
    expect(musicTarget({ ...base, status: 'dead', deadMs: 9000 })).toEqual({ mode: 'menu', gain: 1 })
  })
  it('music off, muted, or hidden -> off', () => {
    expect(musicTarget({ ...base, status: 'playing', musicOn: false }).mode).toBe('off')
    expect(musicTarget({ ...base, status: 'playing', muted: true }).mode).toBe('off')
    expect(musicTarget({ ...base, status: 'playing', hidden: true }).mode).toBe('off')
    expect(musicTarget({ ...base, status: 'playing', musicOn: undefined }).mode).toBe('play')
  })
  it('unknown status -> off', () => {
    expect(musicTarget({ ...base, status: 'mystery' })).toEqual({ mode: 'off', gain: 0 })
  })
})
