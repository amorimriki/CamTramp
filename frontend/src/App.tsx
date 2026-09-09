import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
<<<<<<< Updated upstream
=======
import { NetworkAccess } from './components/NetworkAccess'
import { Recordings } from './pages/Recordings'
>>>>>>> Stashed changes
import { Settings } from './pages/Settings'
import './App.css'

type View = 'dashboard' | 'recordings' | 'settings'

function App() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <div className="app">
      <header className="app__header">
        <h1>Video Control Center</h1>
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
            className={view === 'recordings' ? 'is-active' : ''}
            aria-current={view === 'recordings' ? 'page' : undefined}
            onClick={() => setView('recordings')}
          >
            Gravações
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
<<<<<<< Updated upstream
      <main className="app__main">{view === 'dashboard' ? <Dashboard /> : <Settings />}</main>
=======
      <main className="app__main">
        {view === 'dashboard' && <Dashboard />}
        {view === 'recordings' && <Recordings />}
        {view === 'settings' && <Settings />}
      </main>
      <footer className="app__footer">
        <NetworkAccess />
      </footer>
>>>>>>> Stashed changes
    </div>
  )
}

export default App
