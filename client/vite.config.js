import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [
      tailwindcss(),
      react({
        jsxRuntime: 'automatic'
      })
    ],
    server: {
      proxy: {
        '/api': env.VITE_SERVER_URL || 'http://localhost:3000',
        '/socket.io': env.VITE_SERVER_URL || 'http://localhost:3000'
      }
    }
  }
})