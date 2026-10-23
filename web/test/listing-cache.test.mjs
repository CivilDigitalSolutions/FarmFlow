import test from 'node:test';
import assert from 'node:assert/strict';

const yam = { id: 'l_yam', title: 'Yam', priceLabel: 'J$300 / kg', images: [] };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ listings: [yam], generatedAt: 1 }) });
const { cachedListing, fetchMarket } = await import('../src/api.ts');

test('a listing opens from the loaded market without waiting on the server', async () => {
  assert.equal(cachedListing('l_yam'), null, 'nothing before the market has loaded');
  await fetchMarket();
  assert.deepEqual(cachedListing('l_yam'), { listing: yam });
  assert.equal(cachedListing('l_gone'), null, 'a listing not in the market still goes to the server');
});
