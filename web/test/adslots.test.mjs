import test from 'node:test';
import assert from 'node:assert/strict';
import { adSlotPositions, interleaveAds, SEARCH_AD_COUNT } from '../src/adslots.ts';

test('adSlotPositions matches the app: positions 5, 13, 21 (1-based), never trailing', () => {
  assert.deepEqual(adSlotPositions(30, 5), [4, 12, 20, 28]); // 4 + 4 ads; a 5th would be trailing
  assert.deepEqual(adSlotPositions(100, 5), [4, 12, 20, 28, 36]);
  assert.deepEqual(adSlotPositions(4, 5), []);                // no listing would follow the slot
  assert.deepEqual(adSlotPositions(5, 5), [4]);
  assert.deepEqual(adSlotPositions(12, 5), [4, 12]);
  assert.deepEqual(adSlotPositions(11, 5), [4]);
  assert.deepEqual(adSlotPositions(50, 0), []);
  assert.deepEqual(adSlotPositions(0, 5), []);
});

test('interleaveAds keeps every listing, in order, and only adds ad markers', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const out = interleaveAds(items, SEARCH_AD_COUNT);
  assert.deepEqual(out.filter((e) => e.kind === 'item').map((e) => e.value), items);
  assert.deepEqual(out.map((e, i) => (e.kind === 'ad' ? i : -1)).filter((i) => i >= 0), [4, 12, 20]);
  assert.deepEqual(out.filter((e) => e.kind === 'ad').map((e) => e.slot), [0, 1, 2]);
  assert.deepEqual(interleaveAds(items, 0).map((e) => e.value), items);
});
