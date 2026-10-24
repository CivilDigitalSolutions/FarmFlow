/*
 * The app's Profile screen (SystemScreens.ProfileScreen), on the Account page: display name and
 * location, the profile photo (verified sellers), the stall's farm description and contact number,
 * and the FarmFlow-updates email consent from Settings. Same documents and fields as the app; every
 * save merges (sell.ts), and a seller's public stall follows each change.
 */
import { useEffect, useState } from 'preact/hooks';
import { fetchMeta } from '../api.ts';
import { Spinner } from '../components.tsx';
import { refreshSession, sellModule } from '../session.ts';
import type { EmailPrefs, SellerProfile } from '../sell.ts';
import type { Meta } from '../types.ts';
import { ContactNumber } from './Sell.tsx';

const FAIL = 'Couldn’t save that. Check your connection and try again.';

export function ProfileEditor({ uid, email }: { uid: string; email: string | null }) {
  const [profile, setProfile] = useState<SellerProfile | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<EmailPrefs | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let live = true;
    sellModule().then(async (m) => {
      const [p, e] = await Promise.all([m.loadSellerProfile(uid), m.loadEmailPrefs(uid)]);
      if (live) { setProfile(p); setPrefs(e); }
    }).catch(() => { if (live) setProfile(null); });
    fetchMeta().then((m) => { if (live) setMeta(m); }).catch(() => undefined);
    return () => { live = false; };
  }, [uid]);

  if (profile === undefined) return <Spinner />;
  if (profile === null) return <p class="error">Couldn’t load your profile. Reload the page to try again.</p>;

  const town = meta?.islands.find((i) => i.name === profile.island)?.towns.find((t) => t.id === profile.townId);
  return (
    <section class="profile" aria-labelledby="profile-title">
      <h2 id="profile-title">Your profile</h2>
      {profile.isSeller && !profile.contactPhone && (
        <p class="notice-box"><strong>Buyers can’t contact you yet.</strong> Add your WhatsApp / SMS number below.</p>
      )}
      <Photo uid={uid} profile={profile} onSaved={setProfile} />
      <Identity uid={uid} profile={profile} meta={meta} townName={town?.name ?? ''} onSaved={setProfile} />
      {profile.isSeller && <FarmDescription uid={uid} profile={profile} onSaved={setProfile} />}
      {profile.isSeller && <ContactNumber uid={uid} profile={profile} onSaved={setProfile} />}
      <dl class="profile-facts">
        <dt>Sign-in email</dt><dd>{email ?? '—'}</dd>
        {prefs?.recoveryEmail && <><dt>Recovery email</dt><dd>{prefs.recoveryEmail}</dd></>}
      </dl>
      {prefs && <MarketingConsent uid={uid} email={email ?? prefs.recoveryEmail} prefs={prefs} onSaved={setPrefs} />}
    </section>
  );
}

function Photo({ uid, profile, onSaved }: { uid: string; profile: SellerProfile; onSaved: (p: SellerProfile) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => { sellModule().then((m) => setAllowed(m.canUploadPhoto(profile))); }, [profile.verification]);

  const pick = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // picking the same file again still fires a change
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { optimise, PROFILE_SPEC } = await import('../images.ts');
      const image = await optimise(file, PROFILE_SPEC);
      onSaved(await (await sellModule()).uploadProfilePhoto(uid, profile, image));
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('That ') ? err.message : FAIL);
    } finally {
      setBusy(false);
    }
  };

  const initial = (profile.displayName.trim()[0] ?? '?').toUpperCase();
  return (
    <div class="profile-photo">
      {profile.photoUrl ? <img src={profile.photoUrl} alt="Your profile photo" width={72} height={72} /> : <span class="avatar-initial" aria-hidden="true">{initial}</span>}
      <div>
        {allowed ? (
          <label class="btn btn-small btn-outline">
            {busy ? 'Uploading…' : profile.photoUrl ? 'Change photo' : 'Add photo'}
            <input type="file" accept="image/*" class="visually-hidden" disabled={busy} onChange={pick} />
          </label>
        ) : (
          <p class="hint">Verify your account to add a profile photo.</p>
        )}
        {error && <p class="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function Identity({ uid, profile, meta, townName, onSaved }: {
  uid: string; profile: SellerProfile; meta: Meta | null; townName: string; onSaved: (p: SellerProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [island, setIsland] = useState(profile.island);
  const [townId, setTownId] = useState(profile.townId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <section class="contact-card">
        <div>
          <strong>{profile.displayName}</strong>
          <p>{[townName, profile.island].filter(Boolean).join(', ') || 'No location set'}</p>
        </div>
        <button type="button" class="btn btn-small btn-outline" onClick={() => {
          setName(profile.displayName); setIsland(profile.island); setTownId(profile.townId); setError(null); setEditing(true);
        }}>Edit</button>
      </section>
    );
  }

  const towns = meta?.islands.find((i) => i.name === island)?.towns ?? [];
  const save = async (e: Event) => {
    e.preventDefault();
    // EditIdentityDialog: name required (trimmed), town required.
    if (!name.trim()) { setError('Enter a display name.'); return; }
    if (!island || !townId) { setError('Choose your island and town.'); return; }
    setBusy(true);
    setError(null);
    try {
      const next = { ...profile, displayName: name.trim(), island, townId };
      await (await sellModule()).saveIdentity(uid, next);
      onSaved(next);
      setEditing(false);
      await refreshSession(); // the header greeting and the rest of the site read the session profile
    } catch {
      setError(FAIL);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="contact-card email-form" onSubmit={save}>
      <label>
        <span>Display name</span>
        <input value={name} autoComplete="name" maxLength={60} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </label>
      {profile.isSeller && <p class="field-note">Buyers see this as your stall’s name.</p>}
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
      <p class="field-note">Your existing listings keep the location they were posted with.</p>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="row">
        <button type="submit" class="btn btn-small btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" class="btn btn-small btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </p>
    </form>
  );
}

function FarmDescription({ uid, profile, onSaved }: { uid: string; profile: SellerProfile; onSaved: (p: SellerProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.farmDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <section class="contact-card">
        <div>
          <strong>About your farm</strong>
          <p>{profile.farmDescription || 'Not set — tell buyers what you grow and how you farm.'}</p>
        </div>
        <button type="button" class="btn btn-small btn-outline" onClick={() => { setValue(profile.farmDescription); setEditing(true); }}>
          {profile.farmDescription ? 'Edit' : 'Add'}
        </button>
      </section>
    );
  }
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = { ...profile, farmDescription: value.trim() };
      await (await sellModule()).saveFarmDescription(uid, next);
      onSaved(next);
      setEditing(false);
    } catch {
      setError(FAIL);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="contact-card email-form" onSubmit={save}>
      <label>
        <span>About your farm</span>
        <textarea rows={4} maxLength={1000} value={value} onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)} />
      </label>
      <p class="field-note">Shown on your stall page.</p>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="row">
        <button type="submit" class="btn btn-small btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" class="btn btn-small btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </p>
    </form>
  );
}

function MarketingConsent({ uid, email, prefs, onSaved }: { uid: string; email: string; prefs: EmailPrefs; onSaved: (p: EmailPrefs) => void }) {
  const [error, setError] = useState<string | null>(null);
  const flip = async () => {
    const on = !prefs.marketingConsent;
    onSaved({ ...prefs, marketingConsent: on }); // optimistic, reverted on failure — as in the app
    setError(null);
    try {
      await (await sellModule()).setMarketingConsent(uid, on, email);
    } catch {
      onSaved({ ...prefs, marketingConsent: !on });
      setError(FAIL);
    }
  };
  return (
    <div>
      <label class="toggle">
        <input type="checkbox" role="switch" checked={prefs.marketingConsent} onChange={flip} />
        <span>FarmFlow updates by email</span>
      </label>
      <p class="hint">Occasional news and selling tips, sent to your account email. You can opt out here
        anytime. Transactional emails (e.g. a listing being approved) are always sent.</p>
      {error && <p class="error" role="alert">{error}</p>}
    </div>
  );
}
