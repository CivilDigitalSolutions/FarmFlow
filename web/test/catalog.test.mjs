// Runs under Node's built-in TypeScript type stripping (Node >= 22.18): `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNITS, unitsFor, measurementFromStored, measurementFields, measurementLabel, expiresLabel,
  parsePrice, parseQuantity, normalisePhone, DEFAULT_MEASUREMENT,
} from '../src/catalog.ts';
import { targetDimensions } from '../src/images.ts';

test('units match Measurement.kt: 31 units across 7 types, Custom offered separately', () => {
  assert.equal(UNITS.length, 31);
  assert.deepEqual(unitsFor('WEIGHT').map((u) => u.key), ['KILOGRAM', 'GRAM', 'POUND', 'OUNCE', 'TONNE']);
  assert.deepEqual(unitsFor('BUNDLE').map((u) => u.label), ['Bunch', 'Bale', 'Bundle']);
});

test('stored fields round-trip exactly as Measurement.typeKey / unitKey / storedCustom', () => {
  assert.deepEqual(measurementFields({ type: 'BUNDLE', unit: 'BUNCH', custom: null }),
    { measurementType: 'BUNDLE', unit: 'BUNCH', customUnit: null });
  assert.deepEqual(measurementFields({ type: 'CONTAINER', unit: null, custom: ' Hamper ' }),
    { measurementType: 'CONTAINER', unit: 'Custom', customUnit: 'Hamper' });
  assert.deepEqual(measurementFromStored('BUNDLE', 'BUNCH', null), { type: 'BUNDLE', unit: 'BUNCH', custom: null });
  assert.deepEqual(measurementFromStored('CONTAINER', 'Custom', 'Hamper'), { type: 'CONTAINER', unit: null, custom: 'Hamper' });
  // A unit from another type is data drift: kept as the seller's own wording (fromStored).
  assert.deepEqual(measurementFromStored('WEIGHT', 'BUNCH', null), { type: 'WEIGHT', unit: null, custom: 'BUNCH' });
  assert.deepEqual(measurementFromStored(undefined, 'lbs', null), DEFAULT_MEASUREMENT);
});

test('labels pluralize like pluralizeUnit / Measurement.label', () => {
  assert.equal(measurementLabel({ type: 'BUNDLE', unit: 'BUNCH', custom: null }, 40), 'Bunches');
  assert.equal(measurementLabel({ type: 'WEIGHT', unit: 'KILOGRAM', custom: null }, 5), 'kg');
  assert.equal(measurementLabel({ type: 'CONTAINER', unit: 'BOX', custom: null }, 2), 'Boxes');
  assert.equal(measurementLabel({ type: 'COUNT', unit: 'DOZEN', custom: null }, 3), 'Dozen');
  assert.equal(measurementLabel({ type: 'COUNT', unit: null, custom: 'Hamper' }, 3), 'Hamper');
});

test('expiresLabel buckets like Listing.expiresLabel', () => {
  const day = 86_400_000;
  const now = 1_000 * day;
  assert.equal(expiresLabel(now, 30, now), 'Expires in 30 days');
  assert.equal(expiresLabel(now - 29 * day, 30, now), 'Expires tomorrow');
  assert.equal(expiresLabel(now - 30 * day, 30, now), 'Expires today');
  assert.equal(expiresLabel(now - 32 * day, 30, now), 'Expired');
  assert.equal(expiresLabel(null, 30, now), 'Expires in 30d');
});

test('form parsing: positive prices with ≤ 2 decimals, whole quantities, phone numbers', () => {
  assert.equal(parsePrice('15'), 15);
  assert.equal(parsePrice('8.50'), 8.5);
  assert.equal(parsePrice('1,200'), 1200);
  for (const bad of ['', '0', '-3', '1.234', 'abc', '1e5', '9999999']) assert.equal(parsePrice(bad), null, bad);
  assert.equal(parseQuantity('40'), 40);
  for (const bad of ['0', '2.5', '-1', 'ten']) assert.equal(parseQuantity(bad), null, bad);
  assert.equal(normalisePhone('  +1 (868)  555-0101 '), '+1 (868) 555-0101');
  assert.equal(normalisePhone(''), '');
  for (const bad of ['123', 'call me', '+1 868 555 0101 ext 4', '1'.repeat(16), '<script>']) assert.equal(normalisePhone(bad), null, bad);
});

test('targetDimensions fits the longest edge, keeps aspect, never upscales (ImageOptimizer)', () => {
  assert.deepEqual(targetDimensions(4032, 3024, 1600), [1600, 1200]);
  assert.deepEqual(targetDimensions(3024, 4032, 300), [225, 300]);
  assert.deepEqual(targetDimensions(800, 600, 1600), [800, 600]);
  assert.deepEqual(targetDimensions(10000, 10, 300), [300, 1]);
});
