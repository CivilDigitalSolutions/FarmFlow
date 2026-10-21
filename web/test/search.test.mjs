// Runs under Node's built-in TypeScript type stripping (Node >= 22.18): `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { search, convert, priceEstimateLabel, formatDistance, formatMoney, haversineKm } from '../src/search.ts';

const L = (over) => ({
  id: over.id, title: 'Item', category: 'Vegetables', description: '', emoji: '🥬', price: 10, currency: 'TTD',
  priceLabel: '', quantity: 1, quantityLabel: '', images: [], verification: 'UNVERIFIED', island: 'Trinidad',
  townName: '', townLat: null, townLng: null, updatedAt: null, path: '', ...over,
});

// Newest first, as the API returns them.
const listings = [
  L({ id: 'a', title: 'Callaloo', price: 15, townLat: 10.64, townLng: -61.28 }),                   // Arima
  L({ id: 'b', title: 'Scotch bonnet', category: 'Peppers', price: 30, verification: 'VERIFIED',
    townLat: 10.28, townLng: -61.46 }),                                                              // San Fernando
  L({ id: 'c', title: 'Yam', category: 'Provisions', island: 'Jamaica', currency: 'JMD', price: 500,
    description: 'Yellow yam, callaloo on request' }),
  L({ id: 'd', title: 'Mango', category: 'Fruit', price: 5, verification: 'COMMERCIAL',
    townLat: 10.65, townLng: -61.50 }),                                                              // Port of Spain
];
const base = { text: '', category: null, island: null, verifiedOnly: false, sort: 'NEWEST', origin: null, displayCurrency: 'USD' };
const ids = (r) => r.map((x) => x.listing.id);

test('all islands, newest keeps API order', () => {
  assert.deepEqual(ids(search(listings, base)), ['a', 'b', 'c', 'd']);
});

test('island scope, category, verified-only (UNVERIFIED excluded, COMMERCIAL kept)', () => {
  assert.deepEqual(ids(search(listings, { ...base, island: 'Jamaica' })), ['c']);
  assert.deepEqual(ids(search(listings, { ...base, category: 'Peppers' })), ['b']);
  assert.deepEqual(ids(search(listings, { ...base, verifiedOnly: true })), ['b', 'd']);
});

test('text matches title, category or description, case-insensitively', () => {
  assert.deepEqual(ids(search(listings, { ...base, text: '  CALLALOO ' })), ['a', 'c']);
  assert.deepEqual(ids(search(listings, { ...base, text: 'pepper' })), ['b']);
});

test('nearest: by town centroid, unknown distances last', () => {
  const origin = { lat: 10.6549, lng: -61.5019 }; // Port of Spain
  const r = search(listings, { ...base, sort: 'NEAREST', origin });
  assert.deepEqual(ids(r), ['d', 'a', 'b', 'c']);
  assert.equal(r[3].distanceKm, null);
  // No origin at all → every distance unknown → stable newest order.
  assert.deepEqual(ids(search(listings, { ...base, sort: 'NEAREST' })), ['a', 'b', 'c', 'd']);
});

test('price sorts compare in the display currency across currencies', () => {
  // TTD 5 ≈ 0.74 USD, TTD 15 ≈ 2.2, TTD 30 ≈ 4.4, JMD 500 = 3.2 USD
  assert.deepEqual(ids(search(listings, { ...base, sort: 'PRICE_LOW' })), ['d', 'a', 'c', 'b']);
  assert.deepEqual(ids(search(listings, { ...base, sort: 'PRICE_HIGH' })), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(search(listings, { ...base, priceMin: 3, priceMax: 4 })), ['c']);
});

test('FX + labels match FxRates / Currency.format', () => {
  assert.equal(convert(10, 'USD', 'BBD'), 20);
  assert.equal(convert(1, 'XXX', 'USD'), null);
  assert.equal(formatMoney(8.5, 'XCD'), 'EC$8.50');
  assert.equal(formatMoney(1250.75, 'GYD'), 'G$1250');
  assert.equal(priceEstimateLabel(L({ id: 'x', price: 10, currency: 'USD' }), 'BBD'), 'Bds$20');     // pegged: exact
  assert.equal(priceEstimateLabel(L({ id: 'x', price: 100, currency: 'TTD' }), 'XCD'), '≈ EC$40');  // floating: rounded
  assert.equal(priceEstimateLabel(L({ id: 'x', price: 100, currency: 'TTD' }), 'TTD'), null);
  assert.equal(formatDistance(0.4), '<1 km');
  assert.equal(formatDistance(12.6), '~13 km');
  assert.ok(Math.abs(haversineKm({ lat: 10.6549, lng: -61.5019 }, { lat: 10.2796, lng: -61.4589 }) - 41.9) < 1);
});
