/*
 * Marketplace search, ported from the Android app so results match it:
 *   search()             ← AppViewModel.search(ProduceQuery)
 *   convert / estimate   ← data/FxRates.kt (convert, isExact, Listing.priceEstimateLabel)
 *   haversineKm          ← data/Geo.kt
 *   formatDistance       ← BuyerScreens.kt formatDistance
 *
 * Differences, both forced by privacy rather than chosen:
 *   - Distance uses the listing's TOWN centroid. Android also uses the seller's private precise point
 *     when one exists; that point never leaves the server (see functions/web/projection.js).
 *   - `island: null` means "all islands" — Android's Home feed (activeListings) — while an island
 *     scopes results like Android's Search screen. Android's "include nearby islands" toggle is the
 *     same as choosing All islands here.
 *
 * Dependency-free on purpose: web/test/search.test.mjs runs it directly under Node.
 */
import type { PublicListing } from './types.ts';

export type SortMode = 'NEAREST' | 'NEWEST' | 'PRICE_LOW' | 'PRICE_HIGH';

export const SORT_LABELS: Record<SortMode, string> = {
  NEAREST: 'Nearest',
  NEWEST: 'Newest',
  PRICE_LOW: 'Price ↑',
  PRICE_HIGH: 'Price ↓',
};

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ProduceQuery {
  text: string;
  category: string | null;
  /** null = every island (the Home feed). */
  island: string | null;
  verifiedOnly: boolean;
  sort: SortMode;
  /** Where "Nearest" measures from: a coarse device fix, or the chosen town's centroid. */
  origin: LatLng | null;
  /** Price bounds, in [displayCurrency]. */
  priceMin?: number | null;
  priceMax?: number | null;
  /** The currency prices are compared in — the selected island's, else USD. */
  displayCurrency: string;
}

export interface SearchResult {
  listing: PublicListing;
  distanceKm: number | null;
}

/** 1 unit of the currency in USD (FxRates.usdPerUnit). */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1.0,
  XCD: 1.0 / 2.7,
  BBD: 0.5,
  BSD: 1.0,
  TTD: 0.147,
  JMD: 0.0064,
  GYD: 0.0048,
};
const PEGGED = new Set(['USD', 'XCD', 'BBD', 'BSD']);

/** code → [symbol, fractional digits] (Currency.kt). */
const CURRENCY_FORMAT: Record<string, [string, number]> = {
  XCD: ['EC$', 2], TTD: ['TT$', 2], BBD: ['Bds$', 2], JMD: ['J$', 2], BSD: ['B$', 2], GYD: ['G$', 0], USD: ['US$', 2],
};

export function formatMoney(amount: number, currency: string): string {
  const [symbol, digits] = CURRENCY_FORMAT[currency] ?? CURRENCY_FORMAT.USD;
  const number = amount % 1 === 0 || digits === 0 ? String(Math.trunc(amount)) : amount.toFixed(digits);
  return symbol + number;
}

export function convert(amount: number, from: string, to: string): number | null {
  if (from === to) return amount;
  const f = USD_PER_UNIT[from];
  const t = USD_PER_UNIT[to];
  if (f == null || t == null) return null;
  return (amount * f) / t;
}

/** "≈ EC$32" / "Bds$5.40" in [display], or null when it is the listing's own currency. */
export function priceEstimateLabel(listing: PublicListing, display: string): string | null {
  if (display === listing.currency) return null;
  const converted = convert(listing.price, listing.currency, display);
  if (converted == null) return null;
  const exact = PEGGED.has(listing.currency) && PEGGED.has(display);
  return exact ? formatMoney(converted, display) : '≈ ' + formatMoney(Math.round(converted), display);
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const r = 6371.0;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function formatDistance(km: number | null): string | null {
  if (km == null) return null;
  return km < 1 ? '<1 km' : `~${Math.round(km)} km`;
}

function priceIn(listing: PublicListing, display: string): number {
  return convert(listing.price, listing.currency, display) ?? listing.price;
}

/**
 * [listings] arrive newest-first (the API's order, as Android's), so NEWEST keeps input order and
 * every sort is stable — ties keep newest first.
 */
export function search(listings: PublicListing[], q: ProduceQuery): SearchResult[] {
  const text = q.text.trim().toLowerCase();
  const results: SearchResult[] = [];
  for (const listing of listings) {
    if (q.island && listing.island !== q.island) continue;
    if (q.category && listing.category !== q.category) continue;
    if (q.verifiedOnly && listing.verification === 'UNVERIFIED') continue;
    if (
      text &&
      !listing.title.toLowerCase().includes(text) &&
      !listing.category.toLowerCase().includes(text) &&
      !listing.description.toLowerCase().includes(text)
    ) continue;
    const price = priceIn(listing, q.displayCurrency);
    if (q.priceMin != null && price < q.priceMin) continue;
    if (q.priceMax != null && price > q.priceMax) continue;
    const distanceKm =
      q.origin && listing.townLat != null && listing.townLng != null
        ? haversineKm(q.origin, { lat: listing.townLat, lng: listing.townLng })
        : null;
    results.push({ listing, distanceKm });
  }
  switch (q.sort) {
    case 'NEAREST':
      return results.sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE));
    case 'PRICE_LOW':
      return results.sort((a, b) => priceIn(a.listing, q.displayCurrency) - priceIn(b.listing, q.displayCurrency));
    case 'PRICE_HIGH':
      return results.sort((a, b) => priceIn(b.listing, q.displayCurrency) - priceIn(a.listing, q.displayCurrency));
    default:
      return results;
  }
}
