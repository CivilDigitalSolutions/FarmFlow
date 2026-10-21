/*
 * Who is signed in, as an observable store. Firebase (auth.ts / data.ts) is only downloaded when it
 * can matter: the visitor has signed in before on this browser (SESSION_FLAG), is returning from a
 * Google / Facebook redirect, or opens a page that needs an account. Everyone else is treated as
 * signed out straight away and never pays for the SDK.
 */
import { useEffect, useState } from 'preact/hooks';
import { store } from './format.ts';
import type { UserProfile } from './data.ts';

export type Session =
  | { status: 'unknown' }
  | { status: 'signedOut' }
  | {
    status: 'signedIn';
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
    /** True when the account has an email + password credential (verification applies to it). */
    hasPassword: boolean;
    /** undefined while loading (or after a failed load); null when there is definitely no users/{uid} profile. */
    profile: UserProfile | null | undefined;
    /** The profile couldn't be read (offline, flaky network). Retry with refreshSession(). */
    profileError?: boolean;
  };

const SESSION_FLAG = 'ff.session';
const PENDING_REDIRECT_KEY = 'ff.pendingRedirect'; // mirrors auth.ts (read here without loading it)

let session: Session = { status: 'unknown' };
const listeners = new Set<(s: Session) => void>();

function set(next: Session) {
  session = next;
  listeners.forEach((l) => l(session));
}

export function getSession(): Session {
  return session;
}

export function useSession(): Session {
  const [s, setS] = useState(session);
  useEffect(() => {
    listeners.add(setS);
    setS(session);
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}

let authPromise: Promise<typeof import('./auth.ts')> | null = null;
let dataPromise: Promise<typeof import('./data.ts')> | null = null;
let sellPromise: Promise<typeof import('./sell.ts')> | null = null;

export function authModule() {
  if (!authPromise) {
    authPromise = import('./auth.ts').then((m) => {
      m.onUser(async (user) => {
        if (!user) {
          store.set(SESSION_FLAG, null);
          set({ status: 'signedOut' });
          return;
        }
        store.set(SESSION_FLAG, '1');
        const base = {
          status: 'signedIn' as const,
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          emailVerified: user.emailVerified,
          hasPassword: user.providerData.some((p) => p.providerId === 'password'),
        };
        set({ ...base, profile: undefined });
        const profile = await loadProfileWithRetry(user.uid);
        if (getSession().status !== 'signedIn') return;
        set(profile === 'error' ? { ...base, profile: undefined, profileError: true } : { ...base, profile });
      });
      return m;
    });
  }
  return authPromise;
}

/** Two attempts; 'error' (never null) when both fail, so a failed read is never taken as "no profile". */
async function loadProfileWithRetry(uid: string): Promise<UserProfile | null | 'error'> {
  const d = await dataModule();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await d.loadProfile(uid);
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return 'error';
}

export function dataModule() {
  dataPromise ??= import('./data.ts');
  return dataPromise;
}

/** The seller tools (sell.ts, with Cloud Storage) — only the /sell pages download them. */
export function sellModule() {
  sellPromise ??= import('./sell.ts');
  return sellPromise;
}

/** Re-read the current user (after email verification) and the profile (after setup). */
export async function refreshSession(): Promise<void> {
  const m = await authModule();
  const user = m.currentUser();
  if (!user || session.status !== 'signedIn') return;
  const verified = await m.refreshVerification().catch(() => session.status === 'signedIn' && session.emailVerified);
  const profile = await loadProfileWithRetry(user.uid);
  if (session.status !== 'signedIn') return;
  set(profile === 'error'
    ? { ...session, emailVerified: verified, profileError: true }
    : { ...session, emailVerified: verified, profile, profileError: false });
}

/** Called once at boot. */
export function initSession(path: string): void {
  let pendingRedirect = false;
  try { pendingRedirect = sessionStorage.getItem(PENDING_REDIRECT_KEY) != null; } catch { /* ignore */ }
  const needsAuth = store.get(SESSION_FLAG) === '1' || pendingRedirect ||
    path.startsWith('/signin') || path.startsWith('/account') || path.startsWith('/sell');
  if (needsAuth) authModule();
  else set({ status: 'signedOut' });
}
