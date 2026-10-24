import { useEffect, useRef, useState } from 'preact/hooks';
import { NotFoundError, cachedListing, fetchListing } from '../api.ts';
import { AdSlot, useAdPlacements } from '../ads.tsx';
import { Badge, Page, Spinner, place } from '../components.tsx';
import { contactDigits, smsUrl, whatsAppUrl } from '../format.ts';
import type { Location } from '../router.ts';
import { dataModule, useSession } from '../session.ts';
import type { ListingSeller } from '../data.ts';
import type { ListingData, PublicListing } from '../types.ts';
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
 * The listing's photos, one at a time: translucent ‹ › buttons step through them and a "2 / 3" counter
 * shows where you are. Still a scroll-snap strip underneath, so a phone swipes as before.
 */
function Gallery({ listing: l }: { listing: PublicListing }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = l.images.length;
  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const i = Math.max(0, Math.min(count - 1, to));
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = strip.current;
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  return (
    <div class="gallery-wrap">
      <div class="gallery" ref={strip} onScroll={onScroll}>
        {count ? l.images.map((img, i) => (
          <img key={img.imageUrl} src={img.imageUrl} alt={i ? `${l.title} photo ${i + 1}` : l.title} loading={i ? 'lazy' : undefined} decoding="async"
            // The marketplace already downloaded the thumbnail: show it while the full photo loads.
            style={img.thumbnailUrl ? { backgroundImage: `url("${img.thumbnailUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
        )) : <span class="gallery-emoji" aria-hidden="true">{l.emoji}</span>}
      </div>
      {count > 1 && <>
        {index > 0 && <button type="button" class="gallery-nav prev" aria-label="Previous photo" onClick={() => go(index - 1)}>‹</button>}
        {index < count - 1 && <button type="button" class="gallery-nav next" aria-label="Next photo" onClick={() => go(index + 1)}>›</button>}
        <span class="gallery-count" aria-live="polite">{index + 1} / {count}</span>
      </>}
    </div>
  );
}

/**
 * ListingDetailScreen. Signed out, it is exactly Android's guest view: the produce, price, quantity
 * and town, with the seller hidden and "Sign in to contact seller". Signed in, the seller card and
 * WhatsApp / SMS contact appear (read through Firestore under the existing rules), contact taps are
 * logged to the seller's analytics like the app's, and the listing can be saved to favourites.
 */
export function ListingPage({ loc, initial }: { loc: Location; initial: ListingData | null }) {
  const id = listingId(loc);
  const fromServer = initial?.listing.id === id;
  const [data, setData] = useState<ListingData | null>(fromServer ? initial : cachedListing(id));
  const [gone, setGone] = useState(false);
  const [error, setError] = useState(false);
  const ads = useAdPlacements();

  useEffect(() => {
    if (fromServer && data?.listing.id === id) return;
    const cached = cachedListing(id);
    setData(cached); // shown at once when opened from the marketplace; refreshed below
    setGone(false);
    setError(false);
    if (!id) { setGone(true); return; }
    let live = true;
    fetchListing(id)
      .then((d) => { if (live) setData(d); })
      .catch((e) => {
        if (!live) return;
        if (e instanceof NotFoundError) setGone(true);
        else if (!cached) setError(true); // keep showing the cached copy if only the refresh failed
      });
    return () => { live = false; };
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
        <Gallery listing={l} />
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
          {ads.detail && <AdSlot key={l.id} unit="detail" />}
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
          {/* In-app messaging: guests see it too, and it asks them to sign in (owner decision). */}
          <a class="btn btn-outline btn-block" href={`/signin?next=${encodeURIComponent(`/messages/new?listing=${id}`)}`}>Message seller</a>
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
        {seller.id !== session.uid && (
          <a class="btn btn-outline btn-block" href={`/messages/${id}_${session.uid}`}>Message seller</a>
        )}
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
