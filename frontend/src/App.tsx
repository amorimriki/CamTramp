import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { NetworkAccess } from './components/NetworkAccess'
import { Settings } from './pages/Settings'
import './App.css'

type View = 'dashboard' | 'settings'

function App() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <div className="app">
      <header className="app__header">
        <h1>Video Control Center</h1>
        <NetworkAccess />
        <nav>
          <button
            type="button"
            className={view === 'dashboard' ? 'is-active' : ''}
            onClick={() => setView('dashboard')}
          >
            Câmaras
          </button>
          <button
            type="button"
            className={view === 'settings' ? 'is-active' : ''}
            onClick={() => setView('settings')}
          >
            Configuração
          </button>
        </nav>
      </header>
      <main className="app__main">{view === 'dashboard' ? <Dashboard /> : <Settings />}</main>
    </div>
  )
}

export default App
