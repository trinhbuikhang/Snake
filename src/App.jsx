import GameCanvas from './components/GameCanvas.jsx'
import Hud from './components/Hud.jsx'

export default function App() {
  return (
    <div className="stage">
      <GameCanvas />
      <Hud />
    </div>
  )
}