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
        <div className="app__brand">
          <svg
            className="app__logo"
            viewBox="0 0 24 24"
            width="26"
            height="26"
            fill="none"
            aria-hidden="true"
          >
            <rect x="2" y="6" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M16 10.5 21.2 7.6c.53-.3 1.2.08 1.2.7v7.4c0 .62-.67 1-1.2.7L16 13.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <div>
            <h1>CamTramp</h1>
            <span className="app__tagline">Vídeo com buffer para trampolim</span>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          <button
            type="button"
            className={view === 'dashboard' ? 'is-active' : ''}
            aria-current={view === 'dashboard' ? 'page' : undefined}
            onClick={() => setView('dashboard')}
          >
            Câmaras
          </button>
          <button
            type="button"
            className={view === 'settings' ? 'is-active' : ''}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => setView('settings')}
          >
            Configuração
          </button>
        </nav>
      </header>
      <main className="app__main">{view === 'dashboard' ? <Dashboard /> : <Settings />}</main>
      <footer className="app__footer">
        <NetworkAccess />
      </footer>
    </div>
  )
}

export default App
