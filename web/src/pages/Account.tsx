import { useEffect, useState } from 'preact/hooks';
import { NotFoundError, fetchListing, fetchMeta } from '../api.ts';
import { Card, Page, ProfileRetry, Spinner } from '../components.tsx';
import { PLAY_URL } from '../format.ts';
import { navigate, type Location } from '../router.ts';
import { authModule, dataModule, refreshSession, useSession } from '../session.ts';
import type { AdSwitch } from '../data.ts';
import type { Meta, PublicListing } from '../types.ts';
import { safeNext } from './SignIn.tsx';

/** Redirects to sign-in when signed out; returns true while the page should render a spinner. */
export function useRequireSignIn(path: string): boolean {
  const session = useSession();
  useEffect(() => {
    if (session.status === 'signedOut') navigate(`/signin?next=${encodeURIComponent(path)}`, { replace: true });
  }, [session.status]);
  return session.status !== 'signedIn';
}

/** The non-blocking verify-email prompt (AppViewModel.showVerifyEmailPrompt), for email accounts. */
export function VerifyEmail() {
  const session = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session.status !== 'signedIn' || !session.hasPassword || session.emailVerified) return null;
  return (
    <aside class="notice-box verify">
      <strong>Verify your email</strong>
      <p>We sent a link to {session.email ?? 'your inbox'}. Open it (check spam too), then come back here.</p>
      {message && <p>{message}</p>}
      <p class="row">
        <button type="button" class="btn btn-small btn-outline" disabled={busy} onClick={async () => {
          setBusy(true);
          setMessage(await (await authModule()).sendVerification());
          setBusy(false);
        }}>Resend email</button>
        <button type="button" class="btn btn-small btn-primary" disabled={busy} onClick={async () => {
          setBusy(true);
          await refreshSession();
          setBusy(false);
          setMessage('Not verified yet — open the link in the email, then try again.');
        }}>I’ve verified</button>
      </p>
    </aside>
  );
}

export function Account() {
  const session = useSession();
  const loading = useRequireSignIn('/account');
  const [saved, setSaved] = useState<PublicListing[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => { document.title = 'Your account | FarmFlow'; }, []);
  useEffect(() => { fetchMeta().then(setMeta).catch(() => undefined); }, []);

  useEffect(() => {
    if (session.status !== 'signedIn') return;
    if (session.profile === null) navigate('/account/setup?next=/account', { replace: true });
  }, [session]);

  const uid = session.status === 'signedIn' ? session.uid : null;
  useEffect(() => {
    if (!uid) return;
    dataModule()
      .then((d) => d.favouriteListingIds(uid))
      .then((ids) => Promise.all(ids.map((id) => fetchListing(id).then((r) => r.listing).catch((e) => {
        if (e instanceof NotFoundError) return null; // sold / removed — hidden, as in the app
        return null;
      }))))
      .then((list) => setSaved(list.filter((l): l is PublicListing => l != null)))
      .catch(() => setSaved([]));
  }, [uid]);

  if (session.status === 'signedIn' && session.profileError) return <Page><ProfileRetry /></Page>;
  if (loading || session.status !== 'signedIn' || !session.profile) return <Page><Spinner /></Page>;

  const p = session.profile;
  const town = meta?.islands.find((i) => i.name === p.island)?.towns.find((t) => t.id === p.townId);
  return (
    <Page class="account">
      <h1>Hi, {p.displayName}</h1>
      <p class="lede">{session.email}{p.island ? ` · ${[town?.name, p.island].filter(Boolean).join(', ')}` : ''}</p>
      <VerifyEmail />

      <h2>Saved listings</h2>
      {saved == null ? <Spinner /> : saved.length ? (
        <div class="grid">{saved.map((l) => <Card key={l.id} listing={l} />)}</div>
      ) : (
        <p class="empty">Nothing saved yet. Tap “♡ Save” on a listing to keep it here.</p>
      )}

      <section class="notice-box">
        <strong>{p.isSeller ? 'Your stall' : 'Want to sell?'}</strong>
        <p>
          {p.isSeller
            ? 'List produce, update your contact number and manage your listings — here or in the FarmFlow Android app.'
            : 'Selling is free. List your produce right here on the website, or in the FarmFlow Android app.'}
        </p>
        <p class="row">
          <a class="btn btn-small btn-primary" href="/sell">{p.isSeller ? 'My listings' : 'Start selling'}</a>
          <a class="btn btn-small btn-outline" href={PLAY_URL} rel="noopener">FarmFlow on Google Play</a>
        </p>
      </section>

      <AdControls uid={session.uid} />

      <p class="row">
        <a class="btn btn-outline" href="/donate">Support FarmFlow</a>
        <button type="button" class="btn btn-ghost" onClick={async () => {
          // Leave the page first: once signed out, this page's own guard would bounce to /signin.
          navigate('/');
          await (await authModule()).signOut();
        }}>Sign out</button>
      </p>
      <p class="hint">To delete your account, see <a href="/account-deletion/">account deletion</a>.</p>
    </Page>
  );
}

const AD_SWITCHES: { field: AdSwitch; label: string }[] = [
  { field: 'searchNativeEnabled', label: 'Search results ads' },
  { field: 'detailGridEnabled', label: 'Listing page ads' },
];

/**
 * The app's Ad controls screen, on the web: the same two config/ads switches, so each one turns a
 * placement on or off in the app AND on the website. Admins only (the `admin` claim; firestore.rules
 * enforce it on the write). Optimistic, reverting if the write fails — as in the app.
 */
function AdControls({ uid }: { uid: string }) {
  const [admin, setAdmin] = useState(false);
  const [values, setValues] = useState<Record<AdSwitch, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    authModule().then((m) => m.isAdmin()).then(async (isAdmin) => {
      if (!live || !isAdmin) return;
      setAdmin(true);
      try {
        const v = await (await dataModule()).loadAdSwitches();
        if (live) setValues(v);
      } catch {
        if (live) setError('Couldn’t load the ad switches.');
      }
    });
    return () => { live = false; };
  }, [uid]);

  if (!admin) return null;
  const flip = async (field: AdSwitch) => {
    if (!values) return;
    const next = !values[field];
    setValues({ ...values, [field]: next });
    setError(null);
    try {
      await (await dataModule()).setAdSwitch(field, next, uid);
    } catch {
      setValues((v) => (v ? { ...v, [field]: !next } : v));
      setError('Couldn’t save that change. Check your connection and that this account is an admin.');
    }
  };
  return (
    <section class="notice-box ad-controls">
      <strong>Ad controls</strong>
      <p>Each switch controls ads in the Android app and on the website together. The app updates
        straight away; the website within about two minutes.</p>
      {values == null ? <Spinner /> : AD_SWITCHES.map(({ field, label }) => (
        <label class="toggle" key={field}>
          <input type="checkbox" role="switch" checked={values[field]} onChange={() => flip(field)} />
          <span>{label}</span>
        </label>
      ))}
      <p class="hint">The website also needs its AdSense ad units set up before any ad can appear there.</p>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}

/** ProfileSetupScreen — display name, island + town, optional recovery email. */
export function AccountSetup({ loc }: { loc: Location }) {
  const session = useSession();
  const loading = useRequireSignIn('/account/setup');
  const next = safeNext(loc.search.get('next'), '/account');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [name, setName] = useState('');
  const [island, setIsland] = useState('');
  const [townId, setTownId] = useState('');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.title = 'Set up your profile | FarmFlow'; }, []);
  useEffect(() => { fetchMeta().then(setMeta).catch(() => setError('Couldn’t load the island list. Check your connection.')); }, []);
  useEffect(() => {
    if (session.status === 'signedIn' && session.profile) navigate(next, { replace: true });
    if (session.status === 'signedIn' && !name && session.displayName) setName(session.displayName);
  }, [session]);

  if (session.status === 'signedIn' && session.profileError) return <Page><ProfileRetry /></Page>;
  if (loading || session.status !== 'signedIn' || session.profile === undefined) return <Page><Spinner /></Page>;

  const towns = meta?.islands.find((i) => i.name === island)?.towns ?? [];
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // 'exists' (already set up elsewhere) writes nothing; either way the refreshed profile moves us on.
      await (await dataModule()).createProfile(session.uid, { displayName: name, island, townId, recoveryEmail: recovery });
      await refreshSession();
    } catch {
      setError('Could not save your profile. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Page class="auth">
      <form class="auth-card email-form" onSubmit={save}>
        <h1>Set up your profile</h1>
        <VerifyEmail />
        <label>
          <span>Display name</span>
          <input value={name} placeholder="Marlon's Farm" autoComplete="name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          <span>Island</span>
          <select value={island} onChange={(e) => { setIsland((e.target as HTMLSelectElement).value); setTownId(''); }}>
            <option value="">Choose your island</option>
            {meta?.islands.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
        </label>
        {island && (
          <label>
            <span>Town</span>
            <select value={townId} onChange={(e) => setTownId((e.target as HTMLSelectElement).value)}>
              <option value="">Choose your town</option>
              {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>Recovery email (optional)</span>
          <input type="email" value={recovery} placeholder="you@email.com" autoComplete="email" onInput={(e) => setRecovery((e.target as HTMLInputElement).value)} />
        </label>
        {error && <p class="error" role="alert">{error}</p>}
        <button type="submit" class="btn btn-primary btn-block" disabled={busy || !island || !townId}>
          {busy ? 'Saving…' : 'Save Profile'}
        </button>
      </form>
    </Page>
  );
}
