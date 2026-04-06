import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/Grand-strategy/',
  resolve: {
    alias: {
      '@contracts': resolve(__dirname, './src/contracts'),
    },
  },
  build: {
    target: 'es2022',
  },
})
