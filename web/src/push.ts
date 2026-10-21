/*
 * Web push notifications — the same Firebase Cloud Messaging the Android app uses. A browser's token
 * is stored next to the app's, in users/{uid}/fcmTokens/{token} (platform: 'web'), so every
 * notification FarmFlow sends (moderation, new listings from favourites, expiry reminders,
 * announcements) reaches the website too; the Cloud Function adds the web icon, the monochrome
 * sunrise badge and a tap-through link to /notifications, and /sw.js displays it.
 *
 * iPhone / iPad: Apple only allows web push for sites added to the Home Screen (iOS 16.4+), and only
 * after a tap — so there the settings first explain "Add to Home Screen", then offer the switch.
 *
 * Loaded on demand (Account → Notifications), so browsing never downloads the messaging SDK.
 */
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import { db } from './data.ts';
import { app } from './firebase.ts';
import { isIos, isStandalone, store } from './format.ts';

/**
 * The project's Web Push certificate public key: Firebase console → Project settings → Cloud
 * Messaging → Web configuration → Web Push certificates → Generate key pair, then paste the key here.
 * While it is empty the website shows no notification switch at all.
 */
const VAPID_KEY: string = import.meta.env.VITE_WEB_PUSH_VAPID_KEY || '';

const TOKEN_KEY = 'ff.pushToken';

export type PushState =
  | 'unconfigured' // no Web Push key yet
  | 'needs-install' // iPhone / iPad Safari: add to Home Screen first
  | 'unsupported'
  | 'blocked' // the user (or browser) denied permission
  | 'off'
  | 'on';

export async function pushState(): Promise<PushState> {
  if (!VAPID_KEY) return 'unconfigured';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported().catch(() => false))) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && store.get(TOKEN_KEY) ? 'on' : 'off';
}

/** Must run from a tap (iOS requires a user gesture for the permission prompt). */
export async function enablePush(uid: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  await setDoc(doc(db, 'users', uid, 'fcmTokens', token), { platform: 'web', updatedAt: serverTimestamp() });
  store.set(TOKEN_KEY, token);
  return 'on';
}

/** Turns push off for this browser (also on sign-out, so the next account here can't inherit it). */
export async function disablePush(uid: string): Promise<void> {
  const token = store.get(TOKEN_KEY);
  store.set(TOKEN_KEY, null);
  if (!token) return;
  await deleteDoc(doc(db, 'users', uid, 'fcmTokens', token)).catch(() => undefined);
  await deleteToken(getMessaging(app)).catch(() => undefined);
}

/** True when this browser has a push token stored for the signed-in user. */
export function hasPushToken(): boolean {
  return !!store.get(TOKEN_KEY);
}
