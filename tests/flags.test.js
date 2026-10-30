import test from 'node:test';
import assert from 'node:assert/strict';
import { flagMarkup } from '../flags.js';

test('a future country needs no bundled image; untrusted markup never enters its flag', () => {
  assert.match(flagMarkup('de'), /🇩🇪/);
  assert.match(flagMarkup('jp'), /🇯🇵/);
  assert.match(flagMarkup('ch'), /ch.svg/);
  assert.equal(flagMarkup('<img onerror=alert(1)>'), flagMarkup('eu'));
});
