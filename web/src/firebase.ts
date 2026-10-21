/*
 * Firebase for the web marketplace — the SAME project the Android app uses (farmflow-51796), so a
 * FarmFlow account is one account everywhere and every Firestore security rule applies unchanged.
 *
 * Loaded lazily (dynamic import) only when someone signs in or already has a session: a visitor who
 * just browses never downloads the Firebase SDK — browsing runs on the public /api/*.
 *
 * Values match /assets/firebase-config.js (the email action handler's copy). The apiKey is a public
 * client identifier, not a secret.
 */
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';

const DEFAULT_AUTH_DOMAIN = 'farmflow-51796.firebaseapp.com';

/**
 * `npm run build:emulator` only: talk to the local Firebase emulators (demo project) instead of
 * production. A compile-time constant, so production builds contain none of this.
 */
export const USE_EMULATORS = import.meta.env.VITE_FIREBASE_EMULATORS === '1';

/**
 * Hosts served by Firebase Hosting for this project. Each of them serves Firebase's own sign-in
 * handler at /__/auth/, so using the page's own host as authDomain keeps Google / Facebook sign-in
 * first-party — required for redirect sign-in in Safari (iPhone / iPad) and any browser that blocks
 * third-party storage.
 */
const HOSTING_HOSTS = new Set(['www.farmflowcaribbean.com', 'farmflow-51796.web.app', 'farmflow-51796.firebaseapp.com']);

export const app = initializeApp({
  apiKey: 'AIzaSyAiaCVbgdB_OlQNWCfUGy9BaDQ6FplImv8',
  authDomain: HOSTING_HOSTS.has(location.hostname) ? location.hostname : DEFAULT_AUTH_DOMAIN,
  projectId: USE_EMULATORS ? 'demo-farmflow' : 'farmflow-51796',
  storageBucket: 'farmflow-51796.firebasestorage.app',
  messagingSenderId: '288430465932',
  appId: '1:288430465932:web:e1889ac70ae8b9949deca9',
});

// initializeAuth rather than getAuth: no popup/redirect resolver up front, so a signed-in visitor
// doesn't load Google's sign-in helper (apis.google.com) on every page. auth.ts passes the resolver
// only to the Google / Facebook sign-in calls that need it. Sessions persist (IndexedDB, falling back
// to localStorage) until sign-out, as on Android — nothing may switch persistence later, or the
// session moves out of the store this restores from.
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
auth.languageCode = 'en';
if (USE_EMULATORS) connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
