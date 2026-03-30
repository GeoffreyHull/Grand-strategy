import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': resolve(__dirname, './src/contracts'),
    },
  },
  build: {
    target: 'es2022',
  },
})
