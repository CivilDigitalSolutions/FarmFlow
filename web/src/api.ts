import type { ListingData, Market, Meta, SellerData } from './types.ts';

export class NotFoundError extends Error {}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

let metaPromise: Promise<Meta> | null = null;
let marketPromise: Promise<Market> | null = null;
let marketLoaded: Market | null = null;

export function fetchMeta(): Promise<Meta> {
  metaPromise ??= get<Meta>('/api/meta').catch((e) => { metaPromise = null; throw e; });
  return metaPromise;
}

/** The market is fetched once per page load; `refresh` forces a new copy (pull-to-refresh button). */
export function fetchMarket(refresh = false): Promise<Market> {
  if (refresh) marketPromise = null;
  marketPromise ??= get<Market>('/api/market')
    .then((m) => (marketLoaded = m))
    .catch((e) => { marketPromise = null; throw e; });
  return marketPromise;
}

/**
 * The listing as the already-loaded market has it (the same public fields as /api/listing), so a
 * listing opened from Home renders at once instead of waiting on a round trip; the page still
 * refreshes it from the server. Null when the market hasn't loaded or doesn't contain it.
 */
export function cachedListing(id: string): ListingData | null {
  const listing = marketLoaded?.listings.find((l) => l.id === id);
  return listing ? { listing } : null;
}

export const fetchListing = (id: string) => get<ListingData>(`/api/listing?id=${encodeURIComponent(id)}`);
export const fetchSeller = (id: string) => get<SellerData>(`/api/seller?id=${encodeURIComponent(id)}`);

/** Starts a Stripe Checkout donation; resolves to the Stripe-hosted page to send the donor to. */
export async function startDonation(amountPence: number, idToken: string | null): Promise<string> {
  const res = await fetch('/api/donate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ amount: amountPence }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error === 'invalid_amount' ? 'invalid_amount' : 'unavailable');
  return body.url as string;
}
