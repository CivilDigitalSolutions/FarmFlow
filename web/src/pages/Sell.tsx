/*
 * Selling on the web — the app's seller screens (SellerScreens.kt / SystemScreens.kt):
 *   /sell              Become a seller (BecomeSellerDialog), contact number (ContactPhoneDialog),
 *                      My Listings (ListingManagementScreen + ManageListingCard)
 *   /sell/new          Create Listing (CreateListingScreen)
 *   /sell/edit?id=…    Edit Listing (the same screen with an existing listing)
 *
 * Gates, all also enforced by firestore.rules / storage.rules (the UI only explains them):
 *   - signed in with a profile (sign-in → profile setup → back here, like every account page);
 *   - an email + password account must have verified its email before selling. The app doesn't
 *     require this (its verify prompt is non-blocking); the website does, so a throwaway address
 *     can't open a stall from a browser. Google / Facebook accounts are already provider-checked;
 *   - a suspended or removed seller can't create, edit, renew or mark sold (sellerCanTrade).
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchMeta } from '../api.ts';
import {
  CUSTOM_UNIT_MENU_LABEL,
  DEFAULT_MEASUREMENT,
  LIMITS,
  MAX_LISTING_IMAGES,
  MEASUREMENT_TYPES,
  expiresLabel,
  measurementLabel,
  normalisePhone,
  parsePrice,
  parseQuantity,
  unitsFor,
  type Measurement,
  type MeasurementType,
} from '../catalog.ts';
import { Page, ProfileRetry, Spinner } from '../components.tsx';
import { slugify } from '../format.ts';
import type { OptimisedPair } from '../images.ts';
import { navigate, type Location } from '../router.ts';
import { formatMoney } from '../search.ts';
import { refreshSession, sellModule, useSession } from '../session.ts';
import type { ListingStatus, MyListing, SellerProfile, SellerStanding } from '../sell.ts';
import type { ListingImage, Meta } from '../types.ts';
import { VerifyEmail, useRequireSignIn } from './Account.tsx';

type SignedIn = Extract<ReturnType<typeof useSession>, { status: 'signedIn' }>;

/** Shared guard for every /sell page: signed in, profile set up (else setup), loaded. */
function useSellerSession(path: string): { session: SignedIn | null; blocker: JSX.Element | null } {
  const session = useSession();
  const loading = useRequireSignIn(path);
  useEffect(() => {
    if (session.status === 'signedIn' && session.profile === null) {
      navigate(`/account/setup?next=${encodeURIComponent(path)}`, { replace: true });
    }
  }, [session]);
  if (session.status === 'signedIn' && session.profileError) return { session: null, blocker: <Page><ProfileRetry /></Page> };
  if (loading || session.status !== 'signedIn' || !session.profile) return { session: null, blocker: <Page><Spinner /></Page> };
  return { session, blocker: null };
}

const mustVerify = (s: SignedIn) => s.hasPassword && !s.emailVerified;

function VerifyFirst() {
  return (
    <>
      <VerifyEmail />
      <p class="hint">To keep the marketplace safe, sellers on the website need a verified email address.
        Verify yours, then tap “I’ve verified”.</p>
    </>
  );
}

/** SellerModerationNotice. */
function ModerationNotice({ standing }: { standing: SellerStanding }) {
  if (standing.canTrade) return null;
  const until = standing.suspendedUntil
    ? new Date(standing.suspendedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <section class="notice-box notice-alert" role="alert">
      <strong>{standing.status === 'REMOVED' ? 'Your seller profile has been removed' : 'Your account is suspended'}</strong>
      <p>
        {standing.status === 'REMOVED'
          ? 'Your profile and listings are no longer visible on FarmFlow.'
          : 'Your listings are hidden and you cannot create, edit or renew listings while suspended.' +
            (until ? ` Your suspension lifts on ${until}.` : ' This suspension has no set end date.')}
      </p>
      {standing.reason && <p><strong>Reason:</strong> {standing.reason}</p>}
      <p><a href="/contact/">Contact support</a></p>
    </section>
  );
}

// ---------------- /sell ----------------

const TABS: { status: ListingStatus; label: string }[] = [
  { status: 'ACTIVE', label: 'Active' },
  { status: 'EXPIRED', label: 'Expired' },
  { status: 'SOLD_OUT', label: 'Sold Out' },
  { status: 'DELETED_BY_SELLER', label: 'Deleted' },
];

interface HubState {
  profile: SellerProfile;
  standing: SellerStanding;
  listings: MyListing[];
}

export function SellHub({ loc }: { loc: Location }) {
  const { session, blocker } = useSellerSession('/sell');
  const [state, setState] = useState<HubState | null | 'error'>(null);
  const [tab, setTab] = useState<ListingStatus>('ACTIVE');
  const [notice, setNotice] = useState<string | null>(() => {
    const done = loc.search.get('done');
    // The public marketplace caches for about a minute, so a new listing shows there shortly after.
    return done === 'created' ? 'Listing created — it shows in the marketplace within a couple of minutes'
      : done === 'updated' ? 'Listing updated' : null;
  });
  const [partial, setPartial] = useState(() => loc.search.get('photos') === 'partial');

  useEffect(() => { document.title = 'Sell on FarmFlow | FarmFlow'; }, []);

  const uid = session?.uid ?? null;
  const isSeller = session?.profile?.isSeller ?? false;
  const load = async () => {
    if (!uid) return;
    try {
      const m = await sellModule();
      const profile = await m.loadSellerProfile(uid);
      if (!profile) { setState('error'); return; }
      const [standing, listings] = profile.isSeller
        ? await Promise.all([m.loadStanding(uid), m.myListings(profile.sellerId)])
        : [{ status: 'ACTIVE', reason: null, suspendedUntil: null, canTrade: true } as SellerStanding, []];
      setState({ profile, standing, listings });
    } catch {
      setState('error');
    }
  };
  useEffect(() => { load(); }, [uid, isSeller]);

  if (blocker || !session) return blocker!;
  if (state === 'error') {
    return <Page><div class="empty" role="alert"><p>Couldn’t load your seller tools. Check your connection.</p>
      <button type="button" class="btn btn-primary" onClick={() => { setState(null); load(); }}>Try again</button></div></Page>;
  }
  if (!state) return <Page><Spinner /></Page>;

  if (!state.profile.isSeller) return <Page class="sell"><BecomeSeller session={session} profile={state.profile} /></Page>;

  const { profile, standing, listings } = state;
  const counts = Object.fromEntries(TABS.map((t) => [t.status, listings.filter((l) => l.status === t.status).length]));
  const underReview = listings.filter((l) => l.status === 'UNDER_REVIEW');
  const tabs = underReview.length ? [...TABS, { status: 'UNDER_REVIEW' as ListingStatus, label: 'Under Review' }] : TABS;
  const shown = listings.filter((l) => l.status === tab);
  const canCreate = standing.canTrade && !mustVerify(session);
  const replace = (next: MyListing, message: string) => {
    setState({ ...state, listings: listings.map((l) => (l.id === next.id ? next : l)) });
    setNotice(message);
    setPartial(false);
  };

  return (
    <Page class="sell">
      <div class="sell-head">
        <h1>My Listings</h1>
        {canCreate && <a class="btn btn-primary" href="/sell/new">+ New listing</a>}
      </div>
      {notice && <p class="flash" role="status">{notice}{partial ? ' — but not every photo could be uploaded. Edit the listing to try again.' : ''}
        <button type="button" class="link" onClick={() => setNotice(null)}>Dismiss</button></p>}
      {mustVerify(session) && <VerifyFirst />}
      <ModerationNotice standing={standing} />
      <ContactNumber uid={session.uid} profile={profile} onSaved={(p) => setState({ ...state, profile: p })} />

      <div class="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.status} type="button" role="tab" aria-selected={tab === t.status}
            class={`tab ${tab === t.status ? 'tab-on' : ''}`} onClick={() => setTab(t.status)}>
            {t.label}{t.status === 'UNDER_REVIEW' ? ` (${underReview.length})` : counts[t.status] ? ` (${counts[t.status]})` : ''}
          </button>
        ))}
      </div>
      {tab === 'UNDER_REVIEW' && <p class="hint">Listings held for moderation review. They’re temporarily hidden from buyers until our team finishes checking them.</p>}
      {shown.length ? (
        <div class="my-list">
          {shown.map((l) => <ManageCard key={l.id} uid={session.uid} listing={l} canTrade={standing.canTrade} onChange={replace} />)}
        </div>
      ) : <p class="empty">Nothing here yet.</p>}

      <p class="hint">
        <a href={`/seller/${slugify(profile.displayName, 'stall')}?id=${encodeURIComponent(profile.sellerId)}`}>View your public stall</a>
        {' · '}Prices are in your island’s currency. Listings run for 30 days — renew to keep them up.
      </p>
    </Page>
  );
}

/** BecomeSellerDialog, as a page: the plain question, the policies, and a required agreement tick. */
function BecomeSeller({ session, profile }: { session: SignedIn; profile: SellerProfile }) {
  const [agreed, setAgreed] = useState(false);
  const [phone, setPhone] = useState(profile.contactPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mustVerify(session)) {
    return (<><h1>Sell on FarmFlow</h1><VerifyFirst /></>);
  }
  if (!profile.island || !profile.townId) {
    return (<><h1>Sell on FarmFlow</h1><p class="notice-box">Add your island and town to your profile first — your prices are shown in your island’s currency.</p></>);
  }
  const submit = async (e: Event) => {
    e.preventDefault();
    const normalised = normalisePhone(phone);
    if (normalised == null) { setError('That doesn’t look like a phone number. Include the country code, e.g. +1 868 555 0123.'); return; }
    setBusy(true);
    setError(null);
    try {
      await (await sellModule()).becomeSeller(session.uid, profile, normalised);
      await refreshSession(); // the profile now says isSeller → the hub reloads as My Listings
    } catch {
      setError('Couldn’t set up your stall. Check your connection and try again.');
      setBusy(false);
    }
  };
  return (
    <form class="auth-card email-form become-seller" onSubmit={submit}>
      <h1>Are you sure you want to become a seller?</h1>
      <p>Selling on FarmFlow is free. List your produce with photos and a price; buyers contact you
        directly on WhatsApp or SMS, and you agree the sale between you.</p>
      <p>Sellers must comply with FarmFlow’s <a href="/terms/" target="_blank" rel="noopener">Terms of Use</a>,{' '}
        <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a> and marketplace rules
        (including the <a href="/prohibited-items/" target="_blank" rel="noopener">prohibited items list</a>).</p>
      <label>
        <span>Phone (WhatsApp / SMS)</span>
        <input type="tel" inputMode="tel" autoComplete="tel" value={phone} maxLength={LIMITS.phone}
          placeholder="e.g. +1 758 555 0123" onInput={(e) => setPhone((e.target as HTMLInputElement).value)} />
      </label>
      <p class="field-note">Signed-in buyers see this number so they can contact you. You can add or change it later.</p>
      <label class="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed((e.target as HTMLInputElement).checked)} />
        <span>I agree to comply with FarmFlow’s terms and conditions.</span>
      </label>
      {error && <p class="error" role="alert">{error}</p>}
      <button type="submit" class="btn btn-primary btn-block" disabled={!agreed || busy}>{busy ? 'Setting up…' : 'Become a seller'}</button>
    </form>
  );
}

/** ContactPhoneDialog, inline. */
export function ContactNumber({ uid, profile, onSaved }: { uid: string; profile: SellerProfile; onSaved: (p: SellerProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.contactPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: Event) => {
    e.preventDefault();
    const normalised = normalisePhone(value);
    if (normalised == null) { setError('That doesn’t look like a phone number. Include the country code, e.g. +1 868 555 0123.'); return; }
    setBusy(true);
    setError(null);
    try {
      const next = { ...profile, contactPhone: normalised };
      await (await sellModule()).saveContactPhone(uid, next, normalised);
      onSaved(next);
      setEditing(false);
    } catch {
      setError('Couldn’t save your number. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <section class={`contact-card ${profile.contactPhone ? '' : 'contact-missing'}`}>
        <div>
          <strong>Phone (WhatsApp / SMS)</strong>
          <p>{profile.contactPhone || 'Not set — buyers can’t contact you until you add one.'}</p>
        </div>
        <button type="button" class="btn btn-small btn-outline" onClick={() => { setValue(profile.contactPhone); setEditing(true); }}>
          {profile.contactPhone ? 'Change' : 'Add number'}
        </button>
      </section>
    );
  }
  return (
    <form class="contact-card email-form" onSubmit={save}>
      <label>
        <span>Phone (WhatsApp / SMS)</span>
        <input type="tel" inputMode="tel" autoComplete="tel" value={value} maxLength={LIMITS.phone} placeholder="e.g. +1 758 555 0123"
          onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
      </label>
      <p class="field-note">Shown only to signed-in buyers. Leave empty to remove it.</p>
      {error && <p class="error" role="alert">{error}</p>}
      <p class="row">
        <button type="submit" class="btn btn-small btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" class="btn btn-small btn-ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </p>
    </form>
  );
}

const STATUS_LABEL: Record<ListingStatus, string> = {
  ACTIVE: 'Active', EXPIRED: 'Expired', SOLD_OUT: 'Sold Out', UNDER_REVIEW: 'Under Review', REMOVED: 'Removed', DELETED_BY_SELLER: 'Deleted',
};

export const priceLabel = (l: { price: number; currency: string; measurement: Measurement }) =>
  `${formatMoney(l.price, l.currency)} / ${measurementLabel(l.measurement, 1)}`;

/** ManageListingCard: Edit · Renew · Mark Sold (active only) · Delete; none while deleted / held. */
function ManageCard({ uid, listing: l, canTrade, onChange }: {
  uid: string; listing: MyListing; canTrade: boolean; onChange: (l: MyListing, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = l.images[0];
  const actionable = l.status !== 'DELETED_BY_SELLER' && l.status !== 'UNDER_REVIEW' && l.status !== 'REMOVED';

  const act = async (fn: () => Promise<MyListing>, done: string, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn(), done);
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };
  const renew = () => act(async () => {
    await (await sellModule()).setListingStatus(l.id, 'ACTIVE');
    return { ...l, status: 'ACTIVE', expiresInDays: 30, updatedAt: Date.now() };
  }, `Renewed “${l.title}” for 30 days`, 'Couldn’t renew the listing. Please try again.');
  const sold = () => act(async () => {
    await (await sellModule()).setListingStatus(l.id, 'SOLD_OUT');
    return { ...l, status: 'SOLD_OUT', expiresInDays: 0, updatedAt: Date.now() };
  }, `“${l.title}” moved to Sold Out`, 'Couldn’t update the listing. Please try again.');
  const remove = () => {
    if (!confirm(`Delete listing?\n\nThis will remove “${l.title}” from FarmFlow. Buyers will no longer see it.`)) return;
    act(async () => {
      await (await sellModule()).softDeleteListing(l.id, uid, l.images);
      return { ...l, status: 'DELETED_BY_SELLER', expiresInDays: 0, images: [] };
    }, 'Listing deleted', 'Could not delete listing. Please try again.');
  };

  return (
    <article class="my-card">
      <div class="my-card-top">
        <div class="my-thumb">
          {cover ? <img src={cover.thumbnailUrl || cover.imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">{l.emoji}</span>}
        </div>
        <div class="my-card-body">
          <h3>{l.status === 'ACTIVE' ? <a href={`/listing/${slugify(l.title, 'listing')}?id=${encodeURIComponent(l.id)}`}>{l.title}</a> : l.title}</h3>
          <p class="card-price">{priceLabel(l)}</p>
          <p class="card-meta">
            <span class={`status status-${l.status.toLowerCase()}`}>{STATUS_LABEL[l.status]}</span>
            {l.status === 'ACTIVE' && <> {expiresLabel(l.updatedAt, l.expiresInDays)}</>}
          </p>
        </div>
      </div>
      {actionable && (
        <div class="my-actions">
          {canTrade ? <a class="btn btn-small btn-ghost" href={`/sell/edit?id=${encodeURIComponent(l.id)}`}>Edit</a>
            : <button type="button" class="btn btn-small btn-ghost" disabled>Edit</button>}
          <button type="button" class="btn btn-small btn-ghost" disabled={!canTrade || busy} onClick={renew}>Renew</button>
          {l.status === 'ACTIVE' && <button type="button" class="btn btn-small btn-ghost" disabled={!canTrade || busy} onClick={sold}>Mark Sold</button>}
          <button type="button" class="btn btn-small btn-ghost btn-danger" disabled={busy} onClick={remove}>Delete</button>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </article>
  );
}

// ---------------- /sell/new, /sell/edit ----------------

type Slot =
  | { kind: 'existing'; image: ListingImage }
  | { kind: 'new'; key: string; preview: string; pair: OptimisedPair | null; error?: string };

interface EditorData {
  profile: SellerProfile;
  standing: SellerStanding;
  meta: Meta;
  existing: MyListing | null;
}

export function ListingEditor({ loc }: { loc: Location }) {
  const editId = loc.path.startsWith('/sell/edit') ? loc.search.get('id') ?? '' : null;
  const path = editId != null ? `/sell/edit?id=${encodeURIComponent(editId)}` : '/sell/new';
  const { session, blocker } = useSellerSession(path);
  const [data, setData] = useState<EditorData | null | 'error' | 'missing'>(null);
  const uid = session?.uid ?? null;

  useEffect(() => { document.title = `${editId != null ? 'Edit listing' : 'New listing'} | FarmFlow`; }, [editId]);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    (async () => {
      try {
        const m = await sellModule();
        const [profile, meta] = await Promise.all([m.loadSellerProfile(uid), fetchMeta()]);
        if (!profile?.isSeller) { navigate('/sell', { replace: true }); return; }
        const [standing, existing] = await Promise.all([
          m.loadStanding(uid),
          editId != null ? m.loadMyListing(editId, uid) : Promise.resolve(null),
        ]);
        if (!live) return;
        if (editId != null && (!existing || existing.status === 'DELETED_BY_SELLER' || existing.status === 'UNDER_REVIEW' || existing.status === 'REMOVED')) {
          setData('missing');
          return;
        }
        setData({ profile, standing, meta, existing });
      } catch {
        if (live) setData('error');
      }
    })();
    return () => { live = false; };
  }, [uid, editId]);

  if (blocker || !session) return blocker!;
  if (data === 'error') return <Page><p class="empty" role="alert">Couldn’t load the listing form. Check your connection and try again.</p></Page>;
  if (data === 'missing') return <Page><p class="empty">That listing can’t be edited. <a href="/sell">Back to My Listings</a></p></Page>;
  if (!data) return <Page><Spinner /></Page>;
  if (mustVerify(session)) return <Page class="sell"><h1>{editId != null ? 'Edit Listing' : 'Create Listing'}</h1><VerifyFirst /></Page>;
  if (!data.standing.canTrade) return <Page class="sell"><ModerationNotice standing={data.standing} /><p><a href="/sell">Back to My Listings</a></p></Page>;
  return <ListingForm uid={session.uid} {...data} />;
}

function ListingForm({ uid, profile, meta, existing }: EditorData & { uid: string }) {
  const categories = meta.categories.length ? meta.categories : [{ name: 'Vegetables', emoji: '🥬' }];
  const sellerIsland = meta.islands.find((i) => i.name === profile.island);
  // Price currency follows the SELLER's island and is frozen on the listing; editing never changes it.
  const currency = existing?.currency ?? sellerIsland?.currency ?? 'USD';
  const m0 = existing?.measurement ?? DEFAULT_MEASUREMENT;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category && categories.some((c) => c.name === existing.category) ? existing.category : categories[0].name);
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [mType, setMType] = useState<MeasurementType>(m0.type);
  const [unit, setUnit] = useState<string>(m0.unit ?? 'Custom');
  const [customUnit, setCustomUnit] = useState(m0.custom ?? '');
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '');
  // The listing's location defaults to the profile town and can differ per listing.
  const [island, setIsland] = useState(existing?.island || profile.island);
  const [townId, setTownId] = useState(existing?.townId || profile.townId);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [slots, setSlots] = useState<Slot[]>(() => (existing?.images ?? []).map((image) => ({ kind: 'existing', image })));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => slots.forEach((s) => s.kind === 'new' && URL.revokeObjectURL(s.preview)), []);

  const isCustom = unit === 'Custom';
  const measurement: Measurement = isCustom ? { type: mType, unit: null, custom: customUnit.trim() } : { type: mType, unit, custom: null };
  const priceValue = parsePrice(price);
  const qtyValue = parseQuantity(quantity);
  const towns = meta.islands.find((i) => i.name === island)?.towns ?? [];
  const valid = {
    title: title.trim().length > 0,
    price: priceValue != null,
    quantity: qtyValue != null,
    customUnit: !isCustom || customUnit.trim().length > 0,
    town: !!townId && towns.some((t) => t.id === townId),
  };
  const preparing = slots.some((s) => s.kind === 'new' && !s.pair && !s.error);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_LISTING_IMAGES - slots.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const { optimiseWithThumbnail } = await import('../images.ts');
    for (const file of picked) {
      const key = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      setSlots((s) => [...s, { kind: 'new', key, preview, pair: null }]);
      optimiseWithThumbnail(file)
        .then((pair) => setSlots((s) => s.map((x) => (x.kind === 'new' && x.key === key ? { ...x, pair } : x))))
        .catch((e: Error) => setSlots((s) => s.map((x) => (x.kind === 'new' && x.key === key ? { ...x, error: e.message } : x))));
    }
  };
  const removeSlot = (i: number) => setSlots((s) => {
    const gone = s[i];
    if (gone?.kind === 'new') URL.revokeObjectURL(gone.preview);
    return s.filter((_, j) => j !== i);
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    if (Object.values(valid).some((v) => !v) || priceValue == null || qtyValue == null) { setShowErrors(true); return; }
    if (preparing) return;
    setBusy(true);
    setError(null);
    const input = {
      title: title.trim().slice(0, LIMITS.title),
      category,
      emoji: categories.find((c) => c.name === category)?.emoji ?? '🌾',
      price: priceValue,
      measurement,
      quantity: qtyValue,
      description: description.trim().slice(0, LIMITS.description),
      island,
      townId,
    };
    const newPairs = slots.flatMap((s) => (s.kind === 'new' && s.pair ? [s.pair] : []));
    const kept = slots.flatMap((s) => (s.kind === 'existing' ? [s.image] : []));
    try {
      const m = await sellModule();
      const result = existing
        ? await m.updateListing(existing.id, existing, input, kept, newPairs)
        : await m.createListing(uid, profile, currency, input, newPairs);
      navigate(`/sell?done=${existing ? 'updated' : 'created'}${result.allPhotosUploaded ? '' : '&photos=partial'}`, { replace: true });
    } catch {
      setError(existing
        ? 'Couldn’t save your changes. Check your connection and try again.'
        : 'Couldn’t publish your listing. Check your connection and try again.');
      setBusy(false);
    }
  };

  const err = (ok: boolean) => showErrors && !ok;
  return (
    <Page class="sell">
      <nav class="crumbs"><a href="/sell">My Listings</a> › {existing ? 'Edit' : 'New'}</nav>
      <form class="email-form listing-form" onSubmit={submit} noValidate>
        <h1>{existing ? 'Edit Listing' : 'Create Listing'}</h1>

        <fieldset class="photos">
          <legend>Photos</legend>
          <div class="photo-slots">
            {Array.from({ length: MAX_LISTING_IMAGES }, (_, i) => {
              const s = slots[i];
              if (!s) {
                return i === slots.length ? (
                  <label key={`add-${i}`} class="photo-slot photo-add">
                    <input class="sr-only" type="file" accept="image/*" multiple onChange={(e) => {
                      const input = e.target as HTMLInputElement;
                      addFiles(input.files);
                      input.value = '';
                    }} />
                    <span aria-hidden="true">+</span><span class="sr-only">Add photo</span>
                  </label>
                ) : <div key={`empty-${i}`} class="photo-slot" />;
              }
              const src = s.kind === 'existing' ? (s.image.thumbnailUrl || s.image.imageUrl) : s.preview;
              return (
                <div key={s.kind === 'existing' ? s.image.imageUrl : s.key} class="photo-slot">
                  <img src={src} alt={i === 0 ? 'Cover photo' : `Photo ${i + 1}`} />
                  {i === 0 && <span class="cover-tag">Cover</span>}
                  {s.kind === 'new' && !s.pair && !s.error && <span class="photo-state">Preparing…</span>}
                  {s.kind === 'new' && s.error && <span class="photo-state photo-error">{s.error}</span>}
                  <button type="button" class="photo-remove" aria-label={`Remove photo ${i + 1}`} disabled={busy} onClick={() => removeSlot(i)}>×</button>
                </div>
              );
            })}
          </div>
          <p class="field-note">
            {slots.length < MAX_LISTING_IMAGES
              ? `Add up to ${MAX_LISTING_IMAGES} photos of your produce — the first is the one buyers see in the marketplace. Photos are resized and compressed before upload, so they use very little data, and location and camera details are removed.`
              : `That’s the maximum of ${MAX_LISTING_IMAGES} photos. Remove one to add a different picture.`}
          </p>
        </fieldset>

        <label>
          <span>Title *</span>
          <input value={title} maxLength={LIMITS.title} aria-invalid={err(valid.title)} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
          {err(valid.title) && <span class="error">Enter a title</span>}
        </label>
        <label>
          <span>Category *</span>
          <select value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Price * ({currency})</span>
          <span class="prefixed">
            <span class="prefix" aria-hidden="true">{formatMoney(0, currency).replace(/0$/, '')}</span>
            <input value={price} inputMode="decimal" aria-invalid={err(valid.price)} onInput={(e) => setPrice((e.target as HTMLInputElement).value)} />
          </span>
          {err(valid.price) && <span class="error">Enter a price, e.g. 15 or 8.50</span>}
        </label>
        <label>
          <span>Measurement Type *</span>
          <select value={mType} onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value as MeasurementType;
            if (next !== mType) { setMType(next); setUnit(unitsFor(next)[0].key); }
          }}>
            {MEASUREMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label>
          <span>Unit *</span>
          <select value={unit} onChange={(e) => setUnit((e.target as HTMLSelectElement).value)}>
            {unitsFor(mType).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            <option value="Custom">{CUSTOM_UNIT_MENU_LABEL}</option>
          </select>
        </label>
        {isCustom && (
          <label>
            <span>Custom unit *</span>
            <input value={customUnit} maxLength={LIMITS.customUnit} placeholder="e.g. Hamper, Basket, Truckload" aria-invalid={err(valid.customUnit)}
              onInput={(e) => setCustomUnit((e.target as HTMLInputElement).value)} />
            {err(valid.customUnit) && <span class="error">Enter your unit</span>}
          </label>
        )}
        <label>
          <span>Quantity *</span>
          <input value={quantity} inputMode="numeric" aria-invalid={err(valid.quantity)} onInput={(e) => setQuantity((e.target as HTMLInputElement).value)} />
          {err(valid.quantity) && <span class="error">Enter a whole number, e.g. 10</span>}
        </label>

        <fieldset>
          <legend>Location *</legend>
          <p class="field-note">Where the produce is — defaults to your profile town, change it per listing.</p>
          <label>
            <span>Island</span>
            <select value={island} onChange={(e) => { setIsland((e.target as HTMLSelectElement).value); setTownId(''); }}>
              {meta.islands.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
            </select>
          </label>
          <label>
            <span>Town *</span>
            <select value={townId} aria-invalid={err(valid.town)} onChange={(e) => setTownId((e.target as HTMLSelectElement).value)}>
              <option value="">Choose a town</option>
              {towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {err(valid.town) && <span class="error">Choose a town</span>}
          </label>
        </fieldset>

        <label>
          <span>Description</span>
          <textarea rows={5} value={description} maxLength={LIMITS.description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          <span class="field-note">{description.length}/{LIMITS.description}</span>
        </label>

        <p class="notice-box">⚠️ By publishing this listing you confirm it does not contain any prohibited articles. View the{' '}
          <a href="/prohibited-items/" target="_blank" rel="noopener">full list of prohibited articles</a> before publishing.</p>
        {showErrors && Object.values(valid).some((v) => !v) && <p class="error" role="alert">Check the fields marked above.</p>}
        {error && <p class="error" role="alert">{error}</p>}
        <button type="submit" class="btn btn-primary btn-block" disabled={busy || preparing}>
          {busy ? (existing ? 'Saving…' : 'Publishing…') : preparing ? 'Preparing photos…' : existing ? 'Save Changes' : 'Publish Listing'}
        </button>
      </form>
    </Page>
  );
}
