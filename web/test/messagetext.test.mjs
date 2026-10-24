import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasLink, linkProblem } from '../src/messagetext.ts';

// A copy of FarmFlow-App functions/messages/link-cases.json (the rules, functions and Android use it).
const cases = JSON.parse(readFileSync(new URL('./link-cases.json', import.meta.url), 'utf8'));

test('message link check: refuses every shared "refused" case, allows every "allowed" one', () => {
  for (const t of cases.refused) assert.equal(hasLink(t), true, `should refuse: ${t}`);
  for (const t of cases.allowed) assert.equal(hasLink(t), false, `should allow: ${t}`);
});

test('message problems are explained; phone numbers are fine', () => {
  assert.equal(linkProblem('Call me on 876-555-0173'), null);
  assert.match(linkProblem('farm.com'), /Phone numbers are fine/);
  assert.ok(linkProblem('  '));
  assert.ok(linkProblem('x'.repeat(1001)));
});
