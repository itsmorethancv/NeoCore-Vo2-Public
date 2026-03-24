import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        name: 'NeoCore',
        fileName: (format) => `main.${format === 'es' ? 'js' : 'cjs'}`
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts'),
        name: 'NeoCore',
        fileName: (format) => `preload.${format === 'es' ? 'js' : 'cjs'}`
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
      }
    },
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false
    }
  }
})
