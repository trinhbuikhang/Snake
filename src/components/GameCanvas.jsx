import { useEffect, useRef } from 'react'
import { createEngine } from '../three/engine.js'

export default function GameCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const engine = createEngine(canvas)
    engine.start()
    return () => engine.destroy()
  }, [])

  return <canvas ref={canvasRef} className="garden-canvas" aria-hidden="true" />
}