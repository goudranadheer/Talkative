/**
 * Manual test harness for contextual translation quality.
 *
 * Run with your Claude key (nothing is stored):
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/test-translation.ts
 *
 * Each scenario targets one of the contextual behaviors we added.
 * Eyeball the OUTPUT against the EXPECT note — there's no auto-assert,
 * because "good translation" is a judgment call.
 */
import { translateWithReasoning } from '../src/services/reasoning';
import type { Message } from '../src/context/AppContext';

const claudeApiKey = process.env.ANTHROPIC_API_KEY ?? '';
if (!claudeApiKey) {
  console.error('Set ANTHROPIC_API_KEY (your sk-ant-... Claude key) first.');
  process.exit(1);
}

let n = 0;
function msg(speaker: 'me' | 'them', original: string, translated: string): Message {
  return { id: String(++n), speaker, original, translated, timestamp: new Date() };
}

type Scenario = {
  name: string;
  expect: string;
  goal: string;
  history: Message[];
  fromLanguage: string;
  toLanguage: string;
  myLanguage: string;
  theirLanguage: string;
  text: string;
};

const scenarios: Scenario[] = [
  {
    name: 'Word-sense disambiguation (goal-driven)',
    expect: '"package" → compensation/total package sense (e.g. Gesamtpaket), NOT a parcel (Paket).',
    goal: "I'm in a job interview negotiating salary. I want at least €50,000.",
    history: [],
    fromLanguage: 'English', toLanguage: 'German',
    myLanguage: 'English', theirLanguage: 'German',
    text: "I'm more interested in the overall package than just the base.",
  },
  {
    name: 'Register / formality (business setting)',
    expect: 'Formal "Sie", not informal "du" — it is a professional negotiation.',
    goal: 'Formal business meeting with a senior manager I have just met.',
    history: [],
    fromLanguage: 'English', toLanguage: 'German',
    myLanguage: 'English', theirLanguage: 'German',
    text: 'Could you tell me more about the role?',
  },
  {
    name: 'Anti-answer guard (question stays a question)',
    expect: 'An English QUESTION ("How much salary do you expect?"), NOT an answer to it.',
    goal: 'Job interview, salary negotiation.',
    history: [
      msg('me', "I'd like to discuss compensation.", 'Ich möchte über die Vergütung sprechen.'),
    ],
    fromLanguage: 'German', toLanguage: 'English',
    myLanguage: 'English', theirLanguage: 'German',
    text: 'Wie viel Gehalt erwarten Sie?',
  },
  {
    name: 'Reference resolution + term consistency',
    expect: 'Resolves "it" to the apartment; reuses terms already established in history.',
    goal: 'Renting an apartment; I care about price and availability.',
    history: [
      msg('them', 'Die Wohnung in der Friedrichstraße kostet 1200 Euro im Monat.', 'The apartment on Friedrichstraße costs 1200 euros per month.'),
      msg('me', 'That sounds reasonable.', 'Das klingt vernünftig.'),
    ],
    fromLanguage: 'English', toLanguage: 'German',
    myLanguage: 'English', theirLanguage: 'German',
    text: 'Is it still available next month?',
  },
];

(async () => {
  for (const s of scenarios) {
    console.log('\n' + '─'.repeat(70));
    console.log(`▶ ${s.name}`);
    console.log(`  goal:   ${s.goal}`);
    if (s.history.length) {
      console.log('  history:');
      for (const h of s.history) console.log(`    ${h.speaker}: "${h.original}" → "${h.translated}"`);
    }
    console.log(`  input  (${s.fromLanguage}→${s.toLanguage}): ${s.text}`);
    try {
      const out = await translateWithReasoning({
        text: s.text,
        fromLanguage: s.fromLanguage,
        toLanguage: s.toLanguage,
        myLanguage: s.myLanguage,
        theirLanguage: s.theirLanguage,
        conversationContext: s.goal,
        history: s.history,
        groqApiKey: '',
        claudeApiKey,
      });
      console.log(`  OUTPUT: ${out}`);
      console.log(`  EXPECT: ${s.expect}`);
    } catch (e: any) {
      console.log(`  ERROR:  ${e?.message ?? e}`);
    }
  }
  console.log('\n' + '─'.repeat(70));
})();
