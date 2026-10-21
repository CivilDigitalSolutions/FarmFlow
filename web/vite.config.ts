import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// The web marketplace. Built into build/web/, then scripts/assemble.mjs merges it with the static
// marketing pages into dist/ (what Firebase Hosting deploys). Hashed bundles live under /app/ so they
// never collide with the marketing site's own /assets/.
export default defineConfig({
  root: 'web',
  plugins: [preact()],
  build: {
    outDir: '../build/web',
    emptyOutDir: true,
    assetsDir: 'app',
    target: 'es2020',
  },
  server: {
    // `npm run dev` talks to the deployed API; the emulator setup in README.md proxies locally instead.
    proxy: { '/api': 'https://farmflow-51796.web.app' },
  },
});
