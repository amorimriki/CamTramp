import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento o frontend (Vite) e o backend (FastAPI) correm em
    // portas diferentes. O proxy evita problemas de CORS e faz com que o
    // frontend funcione da mesma forma em dev e depois de compilado atrás
    // de um reverse proxy (ver README secção 15, Nginx opcional).
    proxy: {
      '/api': 'http://localhost:8000',
      '/streams': 'http://localhost:8000',
      // ficheiros .mp4 das gravações automáticas (ver backend/api/recordings.py
      // e main.py: app.mount("/recordings", ...)) — sem isto, o link
      // "Transferir" na página de Gravações dava 404 em desenvolvimento.
      '/recordings': 'http://localhost:8000',
      // /ws/status: estado em tempo real das câmaras (ver backend/api/ws.py).
      // Precisa de "ws: true" para o Vite também fazer o upgrade da ligação
      // HTTP para WebSocket, não só pedidos HTTP normais.
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
