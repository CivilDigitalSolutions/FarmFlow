#!/usr/bin/env node
/*
 * Assembles dist/ — exactly what Firebase Hosting serves at www.farmflowcaribbean.com:
 *
 *   1. The static marketing site from the repo root (unchanged files, unchanged URLs), minus:
 *        - index.html  → re-homed at /about/ (canonical + og:url rewritten), because / is now the
 *                        marketplace web app
 *        - listing/    → /listing/ is now server-rendered by the `web` Cloud Function
 *        - tooling (web/, scripts/, node_modules/, build/, docs, config)
 *   2. The web app build (build/web/: index.html, /app/ bundles, manifest, service worker, icons).
 *
 * The repo root stays a working GitHub Pages site until DNS moves to Firebase Hosting, so the
 * cut-over needs no file moves. Run via `npm run build`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const WEB_BUILD = join(ROOT, 'build', 'web');
const SITE = 'https://www.farmflowcaribbean.com';

const EXCLUDE = new Set([
  '.git', '.github', '.gitignore', '.gitattributes', '.nojekyll', '.firebase', '.firebaserc', '.idea', '.vscode',
  'node_modules', 'web', 'scripts', 'build', 'dist',
  'package.json', 'package-lock.json', 'firebase.json', 'CNAME',
  'index.html', 'listing',
]);
const isDoc = (name) => name.endsWith('.md');

if (!existsSync(join(WEB_BUILD, 'index.html'))) {
  console.error('build/web/index.html missing — run `vite build --config web/vite.config.ts` first.');
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);

// 1. Marketing site.
for (const name of readdirSync(ROOT)) {
  if (EXCLUDE.has(name) || isDoc(name)) continue;
  cpSync(join(ROOT, name), join(DIST, name), { recursive: true });
}

// The old home page becomes /about/.
const about = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .replace(`<link rel="canonical" href="${SITE}/">`, `<link rel="canonical" href="${SITE}/about/">`)
  .replace(`<meta property="og:url" content="${SITE}/">`, `<meta property="og:url" content="${SITE}/about/">`)
  // One level deeper than at the root, so the stylesheet must not resolve to /about/assets/.
  .replace('href="assets/farmflow.css', 'href="/assets/farmflow.css');
if (!about.includes(`${SITE}/about/"`) || !about.includes('href="/assets/farmflow.css')) {
  console.error('index.html: canonical / og:url / stylesheet link not found — update scripts/assemble.mjs.');
  process.exit(1);
}
mkdirSync(join(DIST, 'about'));
writeFileSync(join(DIST, 'about', 'index.html'), about);

// 2. The web app (its index.html is the new home page).
cpSync(WEB_BUILD, DIST, { recursive: true });

// Sanity checks the Cloud Function and the App Links depend on.
const shell = readFileSync(join(DIST, 'index.html'), 'utf8');
for (const marker of ['<!--ff:seo-->', '<!--/ff:seo-->', '<!--ff:app-->', '<!--/ff:app-->']) {
  if (!shell.includes(marker)) {
    console.error(`dist/index.html lost the ${marker} marker — the web function can't render pages.`);
    process.exit(1);
  }
}
for (const required of ['.well-known/assetlinks.json', 'auth/action/index.html', 'auth/continue/index.html', '404.html', 'sw.js', 'manifest.webmanifest']) {
  if (!existsSync(join(DIST, required))) {
    console.error(`dist/${required} is missing.`);
    process.exit(1);
  }
}
console.log('dist/ assembled: marketing site + web app.');
