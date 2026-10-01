import { useEffect, useRef, useState } from 'react'

// P6 "First Light": the 3D engine (three.js) loads as a separate chunk so the
// first paint — title, HUD, poems — never waits on the heaviest dependency.
// The canvas fades in once the engine paints its first frame.
export default function GameCanvas() {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let engine = null
    import('../three/engine.js')
      .then(({ createEngine }) => {
        if (cancelled) return
        engine = createEngine(canvasRef.current)
        engine.start()
        setReady(true)
      })
      .catch(() => {
        /* the 3D lake failed to load; the HUD and menus still work */
      })
    return () => {
      cancelled = true
      if (engine) engine.destroy()
      engine = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`garden-canvas${ready ? ' garden-canvas--ready' : ''}`}
      aria-hidden="true"
    />
  )
}
