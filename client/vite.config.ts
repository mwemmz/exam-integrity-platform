import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Render exposes the deployed commit at build time; shown in the exam header tooltip so a deploy can be verified.
  define: { __BUILD_ID__: JSON.stringify((process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7)) },
})
