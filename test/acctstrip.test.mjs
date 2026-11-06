import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSub } from '../src/ui/substrip.mjs';

test('sub-tabs: each new account gets a colour no open tab is using; at most 10 kept', () => {
  let tabs = [];
  for (let i = 0; i < 8; i++) tabs = openSub(tabs, `a${i}`);
  assert.equal(new Set(tabs.map((x) => x.c)).size, 8, 'eight different colours');
  assert.equal(openSub(tabs, 'a3'), tabs, 'opening an open account changes nothing');
  for (let i = 8; i < 14; i++) tabs = openSub(tabs, `a${i}`);
  assert.equal(tabs.length, 10);
  assert.equal(tabs.at(-1).id, 'a13');
});
