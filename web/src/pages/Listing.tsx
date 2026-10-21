import { useEffect, useState } from 'preact/hooks';
import { NotFoundError, fetchListing } from '../api.ts';
import { Badge, Page, Spinner, place } from '../components.tsx';
import { contactDigits, smsUrl, whatsAppUrl } from '../format.ts';
import type { Location } from '../router.ts';
import { dataModule, useSession } from '../session.ts';
import type { ListingSeller } from '../data.ts';
import type { ListingData } from '../types.ts';
import { Gone } from './Gone.tsx';

/** Current links: /listing/{slug}?id={id}. Links shared before slugs: /listing/{id}. */
export function listingId(loc: Location): string {
  const q = loc.search.get('id');
  if (q) return q;
  const m = loc.path.match(/^\/listing\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : '';
}

const viewedThisSession = new Set<string>();

/**
 * ListingDetailScreen. Signed out, it is exactly Android's guest view: the produce, price, quantity
 * and town, with the seller hidden and "Sign in to contact seller". Signed in, the seller card and
 * WhatsApp / SMS contact appear (read through Firestore under the existing rules), contact taps are
 * logged to the seller's analytics like the app's, and the listing can be saved to favourites.
 */
export function ListingPage({ loc, initial }: { loc: Location; initial: ListingData | null }) {
  const id = listingId(loc);
  const [data, setData] = useState<ListingData | null>(initial?.listing.id === id ? initial : null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (data?.listing.id === id) return;
    setData(null);
    setGone(false);
    setError(false);
    if (!id) { setGone(true); return; }
    fetchListing(id)
      .then(setData)
      .catch((e) => (e instanceof NotFoundError ? setGone(true) : setError(true)));
  }, [id]);

  useEffect(() => {
    if (data) document.title = `${data.listing.title} — ${data.listing.priceLabel} | FarmFlow`;
  }, [data]);

  if (gone) return <Gone kind="listing" />;
  if (error) return <Page><p class="empty">Couldn’t load this listing. Check your connection and try again.</p></Page>;
  if (!data) return <Page><Spinner /></Page>;

  const l = data.listing;
  const where = place(l);
  return (
    <Page class="listing">
      <nav class="crumbs">
        <a href="/">Marketplace</a>
        {l.category && <> › <a href={`/?category=${encodeURIComponent(l.category)}`}>{l.category}</a></>}
      </nav>
      <div class="listing-grid">
        <div class="gallery">
          {l.images.length ? l.images.map((img, i) => (
            <img key={img.imageUrl} src={img.imageUrl} alt={i ? `${l.title} photo ${i + 1}` : l.title} loading={i ? 'lazy' : undefined} decoding="async" />
          )) : <span class="gallery-emoji" aria-hidden="true">{l.emoji}</span>}
        </div>
        <section class="listing-info">
          <h1>{l.title}</h1>
          <p class="listing-price">{l.priceLabel}</p>
          <Badge verification={l.verification} />
          <ul class="facts">
            <li><span>Available</span>{l.quantityLabel}</li>
            {where && <li><span>Location</span>{where}</li>}
            {l.category && <li><span>Category</span>{l.category}</li>}
          </ul>
          <ContactAndSeller listingId={l.id} title={l.title} priceLabel={l.priceLabel} path={l.path} />
          {l.description && <><h2>About this produce</h2><p class="desc">{l.description}</p></>}
          <ShareButton title={l.title} path={l.path} />
        </section>
      </div>
    </Page>
  );
}

function ContactAndSeller({ listingId: id, title, priceLabel, path }: { listingId: string; title: string; priceLabel: string; path: string }) {
  const session = useSession();
  const [seller, setSeller] = useState<ListingSeller | null | undefined>(undefined);
  const [favourite, setFavourite] = useState<boolean | null>(null);
  const uid = session.status === 'signedIn' ? session.uid : null;

  useEffect(() => {
    if (!uid) return;
    let live = true;
    setSeller(undefined);
    dataModule().then(async (d) => {
      const [s, favs] = await Promise.all([
        d.loadListingSeller(id).catch(() => null),
        d.favouriteListingIds(uid).catch(() => [] as string[]),
      ]);
      if (!live) return;
      setSeller(s);
      setFavourite(favs.includes(id));
      // AppViewModel.recordListingView — once per listing per page session.
      if (s && !viewedThisSession.has(id)) {
        viewedThisSession.add(id);
        d.logEvent('LISTING_VIEW', s.id, id, uid).catch(() => undefined);
      }
    });
    return () => { live = false; };
  }, [uid, id]);

  if (session.status === 'unknown') return <Spinner label="Checking your account…" />;
  if (session.status !== 'signedIn') {
    const next = encodeURIComponent(path);
    return (
      <>
        <div class="contact">
          <a class="btn btn-primary btn-block" href={`/signin?next=${next}`}>Sign in to contact seller</a>
        </div>
        <div class="seller-hidden">
          <span aria-hidden="true">🔒</span>
          <div><strong>Seller hidden</strong><p>Sign in to see who's selling this.</p></div>
        </div>
      </>
    );
  }
  if (seller === undefined) return <Spinner label="Loading seller…" />;
  if (seller === null) return <p class="hint">Seller details aren’t available right now.</p>;

  const record = (type: 'CONTACT_WHATSAPP' | 'CONTACT_SMS') =>
    dataModule().then((d) => d.logEvent(type, seller.id, id, session.uid)).catch(() => undefined);
  const toggleFavourite = async () => {
    const next = !favourite;
    setFavourite(next);
    try {
      await (await dataModule()).setFavouriteListing(session.uid, id, next);
    } catch {
      setFavourite(!next);
    }
  };

  return (
    <>
      <div class="contact">
        {contactDigits(seller.contactPhone) ? (
          <div class="contact-row">
            <a class="btn btn-primary" href={whatsAppUrl(seller.contactPhone, title, priceLabel)} target="_blank" rel="noopener" onClick={() => record('CONTACT_WHATSAPP')}>
              WhatsApp
            </a>
            <a class="btn btn-outline" href={smsUrl(seller.contactPhone, title)} onClick={() => record('CONTACT_SMS')}>SMS</a>
          </div>
        ) : (
          <p class="hint">This seller hasn't published a contact number yet.</p>
        )}
        {favourite != null && (
          <button type="button" class="btn btn-ghost fav" aria-pressed={favourite} onClick={toggleFavourite}>
            {favourite ? '♥ Saved' : '♡ Save'}
          </button>
        )}
      </div>
      <a class="seller-card" href={seller.path}>
        {seller.photoUrl
          ? <img class="seller-photo" src={seller.photoUrl} alt="" />
          : <span class="seller-photo stall-initial" aria-hidden="true">{(seller.name || '?').charAt(0)}</span>}
        <div>
          <strong>{seller.name}</strong> <Badge verification={seller.verification} />
          <p>{seller.yearsOnPlatform > 0 ? `${seller.yearsOnPlatform} yr${seller.yearsOnPlatform === 1 ? '' : 's'} on FarmFlow` : 'New on FarmFlow'}</p>
        </div>
        <span class="chev" aria-hidden="true">›</span>
      </a>
    </>
  );
}

function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}${path}`;
  const share = async () => {
    const text = `${title} on FarmFlow`;
    if (navigator.share) {
      try { await navigator.share({ title: text, text, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard */ }
  };
  return <button type="button" class="btn btn-ghost share" onClick={share}>{copied ? 'Link copied ✓' : 'Share listing'}</button>;
}
