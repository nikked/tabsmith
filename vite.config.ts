import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Pages serves a project site from a path, not a domain root, and which path
  // depends on the repository's name. Relative URLs work wherever it lands.
  base: './',
  plugins: [react()],
})
