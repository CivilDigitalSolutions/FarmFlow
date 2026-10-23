/*
 * Web sign-in — the same account protocol as the Android app (AppViewModel / FirebaseRepository):
 *
 *   - Email + password (6+ characters), Google, Facebook — one Firebase account per email.
 *   - "One account per email" collisions get Android's exact wording, without revealing which method
 *     the account uses (email-enumeration protection stays on, as on Android).
 *   - A new email account is sent a verification email whose continue URL is
 *     /auth/continue?flow=verify; verification is non-blocking (prompt + resend + "I've verified").
 *   - Password reset sends Android's email with continue URL /auth/continue?flow=reset.
 *   - Both emails carry the same ActionCodeSettings as Android (handleCodeInApp = false, Android
 *     package for the App Link return), so the custom-domain action handler treats them identically.
 *
 * Guests: Android signs guests in anonymously; on the web nobody needs to sign in to browse (the
 * public API serves the marketplace), so there is no anonymous web session to upgrade. Signing in on
 * the web is only ever a real account.
 *
 * Lazily imported — see firebase.ts.
 */
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type ActionCodeSettings,
  type AuthProvider,
  type User,
} from 'firebase/auth';
import { auth } from './firebase.ts';

const SITE = 'https://www.farmflowcaribbean.com';
const VERIFY_CONTINUE_URL = `${SITE}/auth/continue?flow=verify`;
const RESET_CONTINUE_URL = `${SITE}/auth/continue?flow=reset`;

export const MIN_PASSWORD_LENGTH = 6;

/** Thrown when the person closed the Google / Facebook window — not an error worth showing. */
export class SignInCancelled extends Error {}

function actionCodeSettings(url: string): ActionCodeSettings {
  return {
    url,
    handleCodeInApp: false,
    android: { packageName: 'com.civildigital.farmflow', installApp: true },
  };
}

/** FirebaseRepository.accountCollisionMessage, verbatim. */
export function accountCollisionMessage(email: string | null | undefined): string {
  const who = email && email.trim() ? ` for ${email}` : '';
  return `You already have a FarmFlow account${who}. Please sign in using the method you used ` +
    'when you first created it (email, Google or Facebook).';
}

function code(e: unknown): string {
  return (e as { code?: string })?.code ?? '';
}

/** Firebase error → the sentence a person should see. */
export function friendlyError(e: unknown, fallback: string, email?: string): string {
  switch (code(e)) {
    case 'auth/account-exists-with-different-credential':
      return accountCollisionMessage((e as { customData?: { email?: string } }).customData?.email ?? email);
    case 'auth/email-already-in-use':
      return accountCollisionMessage(email);
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match a FarmFlow account. Check them and try again.';
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/weak-password':
      return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact FarmFlow support for help.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Allow pop-ups for this site, or try again.';
    case 'auth/unauthorized-domain':
    case 'auth/operation-not-allowed':
      return 'This sign-in method isn’t available on the website yet. Please use another method.';
    default:
      return fallback;
  }
}

export function onUser(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export function currentUser(): User | null {
  return auth.currentUser;
}

export async function idToken(): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/**
 * Whether the signed-in user holds the `admin` custom claim — the same claim firestore.rules'
 * isAdmin() checks (synced from users/{uid}.isAdmin by syncAdminClaim). Only decides whether to show
 * admin tools; the rules are the real boundary.
 */
export async function isAdmin(): Promise<boolean> {
  if (!auth.currentUser) return false;
  try {
    return (await auth.currentUser.getIdTokenResult()).claims.admin === true;
  } catch {
    return false;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
  } catch (e) {
    throw new Error(friendlyError(e, 'Sign-in failed.', email));
  }
}

/** Creates the account, then fires the verification email (non-blocking, as on Android). */
export async function registerWithEmail(email: string, password: string): Promise<{ user: User; verifyMessage: string }> {
  let user: User;
  try {
    user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
  } catch (e) {
    throw new Error(friendlyError(e, 'Could not create account.', email.trim()));
  }
  return { user, verifyMessage: await sendVerification() };
}

/** AppViewModel.sendVerificationEmail — returns the message to show either way. */
export async function sendVerification(): Promise<string> {
  const user = auth.currentUser;
  if (!user) return 'Couldn’t send the verification email: please sign in again.';
  try {
    await sendEmailVerification(user, actionCodeSettings(VERIFY_CONTINUE_URL));
    return `Verification email sent to ${user.email ?? 'your inbox'}. Open the link (check spam too), then return here.`;
  } catch (e) {
    return `Couldn’t send the verification email: ${friendlyError(e, 'please try again.')}`;
  }
}

/** Reloads the user to pick up a verification completed on the email link. Resolves to verified. */
export async function refreshVerification(): Promise<boolean> {
  if (!auth.currentUser) return false;
  await reload(auth.currentUser);
  return auth.currentUser?.emailVerified === true;
}

/** EmailAuthScreen's "Forgot password?" — same wording, success never reveals whether the account exists. */
export async function resetPassword(email: string): Promise<string> {
  try {
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings(RESET_CONTINUE_URL));
  } catch (e) {
    if (code(e) !== 'auth/user-not-found') {
      return `Couldn’t send a reset email: ${friendlyError(e, 'please try again.')}`;
    }
  }
  return `If an account exists for ${email.trim()}, a password-reset link is on its way. Check your inbox (and spam folder).`;
}

/**
 * Redirect sign-in only in the installed (home-screen) app, where a pop-up opens outside it. Everywhere
 * else — phones included — a pop-up, falling back to redirect if it's blocked. A phone redirect broke
 * Facebook (owner, 23 Oct, Brave on Android): Facebook's page can hand off to the Facebook app, which
 * comes back in a new tab without the sign-in state ("Unable to process request due to missing
 * initial state"); a pop-up reports back to the page that opened it.
 */
function preferRedirect(): boolean {
  return matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const PENDING_REDIRECT_KEY = 'ff.pendingRedirect';

async function withProvider(provider: AuthProvider, fallback: string): Promise<User | null> {
  const redirect = async () => {
    try { sessionStorage.setItem(PENDING_REDIRECT_KEY, location.pathname + location.search); } catch { /* private mode */ }
    await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    return null; // the page navigates away
  };
  if (preferRedirect()) return redirect();
  try {
    return (await signInWithPopup(auth, provider, browserPopupRedirectResolver)).user;
  } catch (e) {
    const c = code(e);
    if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') throw new SignInCancelled();
    if (c === 'auth/popup-blocked') return redirect();
    throw new Error(friendlyError(e, fallback));
  }
}

export function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return withProvider(provider, 'Google sign-in failed.');
}

/** The FarmFlow Facebook app (Android: @string/facebook_app_id). */
const FACEBOOK_APP_ID = '1027819916355787';
const FB_LOGIN_KEY = 'ff.facebookLogin';
const FB_LOGIN_MAX_AGE_MS = 15 * 60 * 1000;

/** A phone or tablet browser (not the installed app, which keeps Firebase's redirect). */
function mobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
}

/**
 * Facebook on phones, without Firebase's handler. Firebase keeps a redirect or pop-up sign-in's state
 * in the tab that started it, but on Android Facebook's page can hand off to the Facebook app, which
 * returns in a NEW tab — "Unable to process request due to missing initial state" (owner, 23 Oct,
 * Brave; pop-up and redirect alike). Here the state lives in localStorage, which every tab shares:
 * Facebook returns an access token to /signin, and Firebase signs in with it — exactly how the
 * Android app signs in with Facebook (FacebookAuthProvider.credential).
 */
function startFacebookTokenLogin(next: string): never {
  const state = crypto.randomUUID();
  try { localStorage.setItem(FB_LOGIN_KEY, JSON.stringify({ state, next, at: Date.now() })); } catch { /* storage blocked: completion will say so */ }
  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', FACEBOOK_APP_ID);
  url.searchParams.set('redirect_uri', `${location.origin}/signin`);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', 'email,public_profile');
  url.searchParams.set('state', state);
  location.assign(url.toString());
  throw new SignInCancelled(); // never reached in practice: the page is leaving
}

/**
 * Facebook's return to /signin: #access_token=… on success, ?error=…&state=… when the visitor cancels.
 * Returns the part to read, or null when this page load isn't one.
 */
export function facebookTokenReturn(hash: string, search: string): string | null {
  if (/(^|[#&])(access_token|error)=/.test(hash)) return hash;
  if (/[?&]error=/.test(search) && /[?&]state=/.test(search)) return search;
  return null;
}

/**
 * Completes startFacebookTokenLogin in whichever tab Facebook returned to. Resolves to the page to go
 * on to; throws SignInCancelled if the visitor cancelled, or a friendly message on failure.
 */
export async function completeFacebookTokenLogin(returned: string): Promise<string> {
  const params = new URLSearchParams(returned.replace(/^[#?]/, ''));
  history.replaceState(null, '', location.pathname); // drop the token / error from the address bar
  let saved: { state?: string; next?: string; at?: number } = {};
  try { saved = JSON.parse(localStorage.getItem(FB_LOGIN_KEY) ?? '{}'); localStorage.removeItem(FB_LOGIN_KEY); } catch { /* ignore */ }
  if (params.get('error')) throw new SignInCancelled();
  const token = params.get('access_token');
  const fresh = typeof saved.at === 'number' && Date.now() - saved.at < FB_LOGIN_MAX_AGE_MS;
  if (!token || !saved.state || params.get('state') !== saved.state || !fresh) {
    throw new Error('That Facebook sign-in didn’t complete. Please try again.');
  }
  try {
    await signInWithCredential(auth, FacebookAuthProvider.credential(token));
  } catch (e) {
    throw new Error(friendlyError(e, 'Facebook sign-in failed.'));
  }
  return saved.next && saved.next.startsWith('/') && !saved.next.startsWith('//') ? saved.next : '/';
}

export function signInWithFacebook(next = '/'): Promise<User | null> {
  if (mobileBrowser() && !preferRedirect()) startFacebookTokenLogin(next);
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  provider.addScope('public_profile');
  return withProvider(provider, 'Facebook sign-in failed.');
}

/**
 * After a redirect sign-in returns to the site: the signed-in user and the page they started from,
 * or null when no redirect was pending. Throws a friendly message on failure.
 */
export async function completeRedirect(): Promise<{ user: User; returnTo: string } | null> {
  let returnTo: string | null = null;
  try { returnTo = sessionStorage.getItem(PENDING_REDIRECT_KEY); sessionStorage.removeItem(PENDING_REDIRECT_KEY); } catch { /* ignore */ }
  if (!returnTo) return null;
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    return result ? { user: result.user, returnTo } : null;
  } catch (e) {
    throw new Error(friendlyError(e, 'Sign-in failed.'));
  }
}

export function hasPendingRedirect(): boolean {
  try { return sessionStorage.getItem(PENDING_REDIRECT_KEY) != null; } catch { return false; }
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}
