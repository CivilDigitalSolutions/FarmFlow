import test from 'node:test';
import assert from 'node:assert/strict';
import { openedFromApp } from '../src/promo.ts';

test('the app card is skipped when the page was opened from the FarmFlow app', () => {
  assert.equal(openedFromApp('android-app://com.civildigital.farmflow/'), true);
  assert.equal(openedFromApp('android-app://com.civildigital.farmflow'), true);
});

test('the app card still shows for ordinary visitors', () => {
  assert.equal(openedFromApp(''), false);
  assert.equal(openedFromApp('https://www.google.com/'), false);
  assert.equal(openedFromApp('android-app://com.android.chrome/'), false);
});
