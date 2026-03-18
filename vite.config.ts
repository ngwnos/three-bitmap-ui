import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const parseAllowedHosts = (value: string | undefined): string[] => {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = parseAllowedHosts(env.VITE_ALLOWED_HOSTS)

  return {
    plugins: [react()],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      exclude: ['three-bitmap-ui'],
    },
    ...(allowedHosts.length > 0 ? { server: { allowedHosts } } : {}),
  }
})
