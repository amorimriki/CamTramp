import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { NetworkAccess } from './components/NetworkAccess'
import { Recordings } from './pages/Recordings'
import { Settings } from './pages/Settings'
import './App.css'

type View = 'dashboard' | 'recordings' | 'settings'

function App() {
  const [view, setView] = useState<View>('dashboard')

  // Em ecrãs estreitos/verticais (telemóvel) a navegação passa a um menu
  // lateral (ver App.css, @media max-width: 768px) em vez dos 3 botões ao
  // lado do logótipo — não cabem todos na mesma linha sem sobrepor o
  // título. Este estado controla se esse menu está aberto; em ecrãs
  // largos é ignorado (o CSS mantém sempre a navegação visível em linha).
  const [menuOpen, setMenuOpen] = useState(false)

  const handleNavigate = (next: View) => {
    setView(next)
    setMenuOpen(false)
  }

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

        <button
          type="button"
          className="app__menu-toggle"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="app-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>

        <nav id="app-nav" aria-label="Navegação principal" className={menuOpen ? 'is-open' : ''}>
          <button
            type="button"
            className={view === 'dashboard' ? 'is-active' : ''}
            aria-current={view === 'dashboard' ? 'page' : undefined}
            onClick={() => handleNavigate('dashboard')}
          >
            Câmaras
          </button>
          <button
            type="button"
            className={view === 'recordings' ? 'is-active' : ''}
            aria-current={view === 'recordings' ? 'page' : undefined}
            onClick={() => handleNavigate('recordings')}
          >
            Gravações
          </button>
          <button
            type="button"
            className={view === 'settings' ? 'is-active' : ''}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => handleNavigate('settings')}
          >
            Configuração
          </button>
        </nav>

        {menuOpen && (
          <div className="app__nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        )}
      </header>
      <main className="app__main">
        {view === 'dashboard' && <Dashboard />}
        {view === 'recordings' && <Recordings />}
        {view === 'settings' && <Settings />}
      </main>
      <footer className="app__footer">
        <NetworkAccess />
        <p className="app__credits">
          CamTramp &copy; 2026 Ricardo Amorim &middot; licença MIT
        </p>
      </footer>
    </div>
  )
}

export default App
