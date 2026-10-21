import { useEffect, useState } from 'preact/hooks';
import { Page, ProfileRetry, Spinner } from '../components.tsx';
import { navigate, type Location } from '../router.ts';
import { authModule, useSession } from '../session.ts';

/** Only same-site paths are honoured as a post-sign-in destination (no open redirect). */
export function safeNext(raw: string | null, fallback = '/'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}

/**
 * WelcomeScreen + EmailAuthScreen. Same choices as the app — email, Google, Facebook — minus
 * "Continue as guest", because on the web everyone can already browse without an account.
 */
export function SignIn({ loc }: { loc: Location }) {
  const session = useSession();
  const next = safeNext(loc.search.get('next'));
  const [mode, setMode] = useState<'choose' | 'signin' | 'register'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = 'Sign in | FarmFlow'; }, []);

  // Back from a Google / Facebook redirect: surface a failure (success arrives via the session).
  useEffect(() => {
    authModule().then((m) => {
      if (!m.hasPendingRedirect()) return;
      setBusy(true);
      m.completeRedirect()
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(false));
    });
  }, []);

  // Signed in (by any route): finish profile setup first if this account has none, then go on.
  useEffect(() => {
    if (session.status !== 'signedIn' || session.profile === undefined) return;
    navigate(session.profile ? next : `/account/setup?next=${encodeURIComponent(next)}`, { replace: true });
  }, [session]);

  const social = async (which: 'google' | 'facebook') => {
    setError(null);
    setBusy(true);
    try {
      const m = await authModule();
      await (which === 'google' ? m.signInWithGoogle() : m.signInWithFacebook());
    } catch (e) {
      const m = await authModule();
      if (!(e instanceof m.SignInCancelled)) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (session.status === 'signedIn' && session.profileError) return <Page class="auth"><ProfileRetry /></Page>;
  if (session.status === 'unknown' || (session.status === 'signedIn')) {
    return <Page class="auth"><Spinner label="Signing you in…" /></Page>;
  }

  return (
    <Page class="auth">
      <div class="auth-card">
        <img class="auth-logo" src="/icons/icon-192.png" alt="" width={72} height={72} />
        <h1>{mode === 'register' ? 'Create account' : mode === 'signin' ? 'Sign in' : 'Welcome'}</h1>
        {mode === 'choose' ? (
          <>
            <p class="lede">Sign in or create your account to contact sellers and save listings.</p>
            <button type="button" class="btn btn-primary btn-block" disabled={busy} onClick={() => { setError(null); setMode('signin'); }}>
              Continue with email
            </button>
            <button type="button" class="btn btn-social btn-google btn-block" disabled={busy} onClick={() => social('google')}>
              <GoogleMark /> Continue with Google
            </button>
            <button type="button" class="btn btn-social btn-facebook btn-block" disabled={busy} onClick={() => social('facebook')}>
              <span class="fb-mark" aria-hidden="true">f</span> Continue with Facebook
            </button>
            {busy && <Spinner label="Opening sign-in…" />}
            {error && <p class="error" role="alert">{error}</p>}
            <p class="hint">No account needed to browse — <a href="/">keep looking around</a>.</p>
          </>
        ) : (
          <EmailForm
            register={mode === 'register'}
            onSwitch={() => { setError(null); setMode(mode === 'register' ? 'signin' : 'register'); }}
            onBack={() => { setError(null); setMode('choose'); }}
          />
        )}
        <p class="legal">
          By continuing you agree to FarmFlow's <a href="/terms/">Terms</a> &amp; <a href="/privacy/">Privacy Policy</a>.
        </p>
      </div>
    </Page>
  );
}

function EmailForm({ register, onSwitch, onBack }: { register: boolean; onSwitch: () => void; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // EmailAuthScreen validation, unchanged.
  const emailValid = email.includes('@') && email.includes('.');
  const passwordValid = password.length >= 6;
  const confirmValid = !register || password === confirm;
  const canSubmit = emailValid && passwordValid && confirmValid && !busy;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const m = await authModule();
      if (register) await m.registerWithEmail(email, password);
      else await m.signInWithEmail(email, password);
      // The session listener takes it from here (profile setup or the next page).
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!emailValid) {
      setResetMessage('Enter your account email above, then tap “Forgot password?” again.');
      return;
    }
    setResetting(true);
    setResetMessage(await (await authModule()).resetPassword(email));
    setResetting(false);
  };

  return (
    <form class="email-form" onSubmit={submit} noValidate>
      <p class="lede">{register ? 'Create a new FarmFlow account.' : 'Sign in to your FarmFlow account.'}</p>
      <label>
        <span>Email address</span>
        <input type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email}
          onInput={(e) => setEmail((e.target as HTMLInputElement).value)} required />
      </label>
      <label>
        <span>Password</span>
        <span class="pw">
          <input type={show ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password}
            minLength={6} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} required />
          <button type="button" class="link" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      {register && password.length > 0 && !passwordValid && <p class="field-note">At least 6 characters.</p>}
      {register && (
        <label>
          <span>Confirm password</span>
          <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm}
            onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} required />
        </label>
      )}
      {register && confirm.length > 0 && !confirmValid && <p class="error">Passwords do not match.</p>}
      {error && <p class="error" role="alert">{error}</p>}
      <button type="submit" class="btn btn-primary btn-block" disabled={!canSubmit}>
        {busy ? (register ? 'Creating account…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}
      </button>
      {!register && (
        <button type="button" class="link" disabled={resetting} onClick={forgot}>
          {resetting ? 'Sending reset link…' : 'Forgot password?'}
        </button>
      )}
      {resetMessage && <p class="notice-box" role="status">{resetMessage}</p>}
      <button type="button" class="link" onClick={onSwitch}>
        {register ? 'Already have an account? Sign in' : 'No account? Create one'}
      </button>
      <button type="button" class="link link-muted" onClick={onBack}>← Other ways to sign in</button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
