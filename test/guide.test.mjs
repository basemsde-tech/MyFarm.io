import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_VERSION, TEXT } from '../src/guide-content.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

test('the user guide was reviewed for this release', () => {
  assert.equal(GUIDE_VERSION, pkg.version, 'Update src/guide-content.js for the new version, then set GUIDE_VERSION.');
});

test('the guide has the same sections in Arabic and English', () => {
  assert.deepEqual(TEXT.ar.sections.map((x) => x.id), TEXT.en.sections.map((x) => x.id));
  assert.deepEqual(Object.keys(TEXT.ar.help).sort(), Object.keys(TEXT.en.help).sort());
  for (const lang of ['ar', 'en']) for (const s of TEXT[lang].sections) assert.ok(s.steps.length, `${lang}:${s.id} has steps`);
});
