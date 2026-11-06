import { defineConfig } from 'vite'
export default defineConfig({ server: { host: true }, test: { include: ['src/**/*.test.ts'] } })
