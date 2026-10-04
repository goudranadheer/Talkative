const fs = require('node:fs');
const path = require('node:path');
const { detectSpeaker } = require('../.test-build/speaker.js');
const { isLikelyEcho } = require('../.test-build/echoFilter.js');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'heuristic-fixtures.json'), 'utf8'));

function ratio(n, d) {
  return d ? n / d : 0;
}

let speakerCorrect = 0;
for (const c of fixtures.speaker_cases) {
  const enrollment = {
    me: c.meEnrollment ? { label: 'me', detectedLanguage: c.meEnrollment } : null,
    them: c.themEnrollment ? { label: 'them', detectedLanguage: c.themEnrollment } : null,
  };
  const actual = detectSpeaker(c.detectedLanguage, enrollment, c.myLangCode, c.lastTTSEndTime, c.now);
  if (actual === c.expected) speakerCorrect += 1;
  else console.error(`speaker FAIL ${c.id}: expected ${c.expected}, got ${actual}`);
}

let tp=0, fp=0, tn=0, fn=0;
for (const c of fixtures.echo_cases) {
  const actual = isLikelyEcho(c.transcript, c.reference);
  if (actual && c.expected) tp++;
  else if (actual && !c.expected) fp++;
  else if (!actual && !c.expected) tn++;
  else fn++;
  if (actual !== c.expected) console.error(`echo FAIL ${c.id}: expected ${c.expected}, got ${actual}`);
}

const speakerAccuracy = ratio(speakerCorrect, fixtures.speaker_cases.length);
const echoAccuracy = ratio(tp + tn, fixtures.echo_cases.length);
const precision = ratio(tp, tp + fp);
const recall = ratio(tp, tp + fn);

console.log('\nTalkative heuristic evaluation');
console.log('------------------------------');
console.log(`Speaker attribution: ${speakerCorrect}/${fixtures.speaker_cases.length} = ${(speakerAccuracy*100).toFixed(1)}%`);
console.log(`Echo classification: ${tp+tn}/${fixtures.echo_cases.length} = ${(echoAccuracy*100).toFixed(1)}%`);
console.log(`Echo precision:      ${(precision*100).toFixed(1)}%`);
console.log(`Echo recall:         ${(recall*100).toFixed(1)}%`);
console.log(`Confusion: TP=${tp} FP=${fp} TN=${tn} FN=${fn}`);
console.log('\nThese fixtures validate deterministic heuristics only; they are not an ASR or translation benchmark.');

if (speakerCorrect !== fixtures.speaker_cases.length || fp || fn) process.exitCode = 1;
