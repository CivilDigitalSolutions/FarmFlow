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
 * Redirect sign-in on phones, tablets and installed (home-screen) apps — pop-ups are unreliable
 * there, especially on iPhone — and a pop-up on desktop, falling back to redirect if it's blocked.
 */
function preferRedirect(): boolean {
  const standalone = matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac
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

export function signInWithFacebook(): Promise<User | null> {
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
