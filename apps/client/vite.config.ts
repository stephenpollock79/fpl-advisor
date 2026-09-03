import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The client always calls same-origin /api/* (ADR 0006, D4). In development
// that is made true by this proxy rather than by a base-URL variable, so no
// build carries an API origin and CORS never enters the picture.
const API_PORT = 8787

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: `http://localhost:${API_PORT}` },
    },
  },
})
