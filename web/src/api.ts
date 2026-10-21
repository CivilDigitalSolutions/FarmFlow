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

export function fetchMeta(): Promise<Meta> {
  metaPromise ??= get<Meta>('/api/meta').catch((e) => { metaPromise = null; throw e; });
  return metaPromise;
}

/** The market is fetched once per page load; `refresh` forces a new copy (pull-to-refresh button). */
export function fetchMarket(refresh = false): Promise<Market> {
  if (refresh) marketPromise = null;
  marketPromise ??= get<Market>('/api/market').catch((e) => { marketPromise = null; throw e; });
  return marketPromise;
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
