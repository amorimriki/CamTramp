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
    },
  },
})
