import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  build: {
    // chel serve <dir> serves <dir>/index.html at /app/ and <dir>/assets/* at
    // /assets/, which is Vite's default output.
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: mode !== 'production'
  },
  resolve: {
    alias: {
      // @chelonia/lib imports node's Buffer (CIDs, message serialisation, zkpp).
      buffer: 'buffer/'
    }
  },
  define: {
    // @chelonia/lib reads process.env at module scope. Replacing the whole
    // object avoids having to track which flags it reads.
    'process.env': JSON.stringify({
      NODE_ENV: mode === 'production' ? 'production' : 'development',
      // Without this, Chelonia keeps its own copy of every contract's message
      // log in `chelonia.db`, which this app leaves as the default in-memory
      // map. The saved state survives a reload but that map does not, so the
      // first action after a reload fails with "No latest HEAD". An app that
      // wants the full mode has to give Chelonia a `chelonia.db` backed by
      // something durable, like IndexedDB.
      LIGHTWEIGHT_CLIENT: 'true'
    })
  }
}))
