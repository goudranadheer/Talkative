const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWords, wordOverlapRatio, isLikelyEcho } = require('../.test-build/echoFilter.js');

test('normalizes punctuation and case while preserving unicode words', () => {
  assert.deepEqual(normalizeWords('Hello, WÖRLD! 123'), ['hello', 'wörld', '123']);
});

test('flags transcript at or above the 50 percent overlap threshold', () => {
  assert.equal(isLikelyEcho('please call them tomorrow', 'Please call tomorrow'), true);
});

test('does not flag unrelated speech', () => {
  assert.equal(isLikelyEcho('where is the station', 'please call tomorrow'), false);
});

test('empty transcripts have zero overlap', () => {
  assert.equal(wordOverlapRatio('   ', 'anything'), 0);
  assert.equal(isLikelyEcho('', 'anything'), false);
});

test('threshold is configurable for evaluation experiments', () => {
  assert.equal(isLikelyEcho('one two three four', 'one two', 0.75), false);
  assert.equal(isLikelyEcho('one two three four', 'one two', 0.5), true);
});
