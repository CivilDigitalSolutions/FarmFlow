import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchMarket, fetchMeta } from '../api.ts';
import { AdSlot, useAdPlacements } from '../ads.tsx';
import { SEARCH_AD_COUNT, interleaveAds } from '../adslots.ts';
import { Card, InstallHint, Page, Spinner } from '../components.tsx';
import { store } from '../format.ts';
import { navigate, type Location } from '../router.ts';
import { SORT_LABELS, search, type LatLng, type SortMode } from '../search.ts';
import type { Market, Meta } from '../types.ts';

const ISLAND_KEY = 'ff.island';
const TOWN_KEY = 'ff.town';

/**
 * The marketplace — Android's Home feed and Search screen in one page. Anyone can browse; no
 * sign-in. Filters live in the URL (?q=&category=&island=&sort=&verified=1) so results can be shared
 * and the back button works. The chosen island / town are remembered on this device.
 */
export function Home({ loc }: { loc: Location }) {
  const [market, setMarket] = useState<Market | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);
  const [deviceOrigin, setDeviceOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const ads = useAdPlacements();

  const q = loc.search.get('q') ?? '';
  const category = loc.search.get('category');
  const island = loc.search.has('island') ? loc.search.get('island') || null : store.get(ISLAND_KEY);
  const sort = (loc.search.get('sort') as SortMode | null) ?? 'NEWEST';
  const verifiedOnly = loc.search.get('verified') === '1';
  const townId = island ? store.get(TOWN_KEY) : null;

  const load = (refresh = false) => {
    setError(false);
    Promise.all([fetchMarket(refresh), fetchMeta()])
      .then(([m, me]) => { setMarket(m); setMeta(me); })
      .catch(() => setError(true));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    document.title = 'FarmFlow — Buy & Sell Fresh Caribbean Produce Online';
  }, []);

  const islandInfo = meta?.islands.find((i) => i.name === island) ?? null;
  const town = islandInfo?.towns.find((t) => t.id === townId) ?? null;
  const origin = deviceOrigin ?? (town ? { lat: town.lat, lng: town.lng } : null);

  const results = useMemo(() => market ? search(market.listings, {
    text: q,
    category,
    island: islandInfo ? island : null,
    verifiedOnly,
    sort,
    origin,
    displayCurrency: islandInfo?.currency ?? 'USD',
  }) : [], [market, q, category, island, islandInfo, verifiedOnly, sort, origin]);

  /** Updates one or more URL params, keeping the rest. */
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(loc.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    navigate(s ? `/?${s}` : '/', { replace: true });
  };

  const chooseIsland = (name: string) => {
    store.set(ISLAND_KEY, name || null);
    store.set(TOWN_KEY, null);
    setParams({ island: name || '' });
  };

  const chooseTown = (id: string) => {
    store.set(TOWN_KEY, id || null);
    setDeviceOrigin(null);
    setParams(id ? { sort: 'NEAREST' } : {});
  };

  /** Tap-initiated, low-accuracy fix — like Android's coarse "Use my location". Never stored. */
  const nearMe = () => {
    if (!('geolocation' in navigator)) { setLocateMessage('Location isn’t available in this browser.'); return; }
    setLocating(true);
    setLocateMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setDeviceOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setParams({ sort: 'NEAREST' });
      },
      () => {
        setLocating(false);
        setLocateMessage('Couldn’t get your location — choose your town instead.');
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10000 },
    );
  };

  return (
    <Page class="home">
      <InstallHint />
      <section class="hero">
        <h1>Fresh produce, straight from Caribbean growers</h1>
        <p>Browse what’s in stock today, then contact the seller directly on WhatsApp or SMS.</p>
        <form class="searchbar" role="search" onSubmit={(e) => e.preventDefault()}>
          <label class="sr-only" for="q">Search produce</label>
          <input
            id="q"
            type="search"
            placeholder="Search yam, callaloo, pepper…"
            value={q}
            enterKeyHint="search"
            onInput={(e) => setParams({ q: (e.target as HTMLInputElement).value })}
          />
        </form>
      </section>

      {meta && (
        <nav class="chips" aria-label="Categories">
          <button type="button" class={`chip ${!category ? 'chip-on' : ''}`} onClick={() => setParams({ category: null })}>All</button>
          {meta.categories.map((c) => (
            <button
              type="button"
              key={c.name}
              class={`chip ${category === c.name ? 'chip-on' : ''}`}
              aria-pressed={category === c.name}
              onClick={() => setParams({ category: category === c.name ? null : c.name })}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.name}
            </button>
          ))}
        </nav>
      )}

      <div class="filters">
        <label>
          <span>Island</span>
          <select value={islandInfo ? island ?? '' : ''} onChange={(e) => chooseIsland((e.target as HTMLSelectElement).value)}>
            <option value="">All islands</option>
            {meta?.islands.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
          </select>
        </label>
        {islandInfo && (
          <label>
            <span>Your town</span>
            <select value={town?.id ?? ''} onChange={(e) => chooseTown((e.target as HTMLSelectElement).value)}>
              <option value="">—</option>
              {islandInfo.towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>Sort</span>
          <select value={sort} onChange={(e) => setParams({ sort: (e.target as HTMLSelectElement).value })}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </label>
        <label class="toggle">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setParams({ verified: (e.target as HTMLInputElement).checked ? '1' : null })} />
          <span>Verified only</span>
        </label>
        <button type="button" class="btn btn-outline btn-small" onClick={nearMe} disabled={locating}>
          {locating ? 'Locating…' : deviceOrigin ? '📍 Near me ✓' : '📍 Near me'}
        </button>
      </div>
      {locateMessage && <p class="hint">{locateMessage}</p>}
      {sort === 'NEAREST' && !origin && market && (
        <p class="hint">Choose your island and town, or tap “Near me”, to sort by distance.</p>
      )}

      {error ? (
        <div class="empty">
          <p>Couldn’t load the marketplace. Check your connection.</p>
          <button type="button" class="btn btn-primary" onClick={() => load(true)}>Try again</button>
        </div>
      ) : !market ? (
        <Spinner label="Loading fresh produce…" />
      ) : results.length === 0 ? (
        <div class="empty">
          <p>{market.listings.length === 0 ? 'Nothing is listed right now — check back soon.' : 'No produce matches those filters.'}</p>
          {market.listings.length > 0 && (
            <button type="button" class="btn btn-outline" onClick={() => navigate('/', { replace: true })}>Clear filters</button>
          )}
        </div>
      ) : (
        <>
          <p class="count">{results.length} item{results.length === 1 ? '' : 's'} in stock{islandInfo ? ` in ${islandInfo.name}` : ''}</p>
          <div class="grid">
            {interleaveAds(results, ads.search ? SEARCH_AD_COUNT : 0).map((e) => e.kind === 'ad' ? (
              <AdSlot key={`ad-${e.slot}`} unit="search" class="card ad-card" />
            ) : (
              <Card key={e.value.listing.id} listing={e.value.listing} distanceKm={e.value.distanceKm} displayCurrency={islandInfo?.currency ?? null} />
            ))}
          </div>
        </>
      )}

      <section class="sell-cta">
        <h2>Grow produce? Sell it on FarmFlow</h2>
        <p>Listing is free. Sellers use the FarmFlow Android app today; selling on the web is coming next.</p>
        <p><a class="btn btn-outline" href="/about/">How FarmFlow works</a></p>
      </section>
    </Page>
  );
}
