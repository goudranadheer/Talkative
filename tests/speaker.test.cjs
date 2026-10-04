const test = require('node:test');
const assert = require('node:assert/strict');
const { detectSpeaker } = require('../.test-build/speaker.js');

const enrollment = (me, them) => ({
  me: me ? { label: 'me', detectedLanguage: me } : null,
  them: them ? { label: 'them', detectedLanguage: them } : null,
});

test('uses distinct enrolled languages as strongest signal', () => {
  assert.equal(detectSpeaker('de', enrollment('en', 'de'), 'en', null, 10_000), 'them');
  assert.equal(detectSpeaker('en-US', enrollment('en', 'de'), 'en', null, 10_000), 'me');
});

test('uses recent TTS timing when language is ambiguous', () => {
  assert.equal(detectSpeaker('en', enrollment(null, null), 'en', 8_000, 10_000), 'them');
});

test('falls back to configured user language after TTS window', () => {
  assert.equal(detectSpeaker('en', enrollment(null, null), 'en', 5_000, 10_000), 'me');
  assert.equal(detectSpeaker('de', enrollment(null, null), 'en', 5_000, 10_000), 'them');
});

test('normalizes regional language tags', () => {
  assert.equal(detectSpeaker('de-DE', enrollment('en-US', 'de-DE'), 'en', null, 10_000), 'them');
});
