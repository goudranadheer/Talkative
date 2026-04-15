import Groq from 'groq-sdk';
import { Message } from '../context/AppContext';

type ReasonParams = {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  myLanguage: string;
  theirLanguage: string;
  conversationContext: string;
  history: Message[];
  groqApiKey: string;
};

// Groq free tier — context-aware translation using Llama
export async function translateWithReasoning({
  text,
  fromLanguage,
  toLanguage,
  myLanguage,
  theirLanguage,
  conversationContext,
  history,
  groqApiKey,
}: ReasonParams): Promise<string> {
  const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });

  const historyBlock = history.slice(-6).map(m =>
    `${m.speaker === 'me' ? myLanguage : theirLanguage}: "${m.original}" → "${m.translated}"`
  ).join('\n');

  const systemPrompt = `You are a real-time conversation translator.
Translate from ${fromLanguage} to ${toLanguage}.
${conversationContext ? `Context: ${conversationContext}` : ''}
Output ONLY the translated text. No explanations, no quotes, no reasoning in your final answer.`;

  const userMessage = [
    historyBlock ? `Recent conversation:\n${historyBlock}\n` : '',
    `Translate this to ${toLanguage}:\n"${text}"`,
  ].join('');

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
  });

  let result = response.choices[0]?.message?.content ?? '';

  // Strip <think>...</think> reasoning blocks from DeepSeek R1 output
  result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return result;
}

export async function generateSuggestions({
  history,
  conversationContext,
  myLanguage,
  theirLanguage,
  lastSpeaker,
  groqApiKey,
}: {
  history: Message[];
  conversationContext: string;
  myLanguage: string;
  theirLanguage: string;
  lastSpeaker: 'me' | 'them';
  groqApiKey: string;
}): Promise<string[]> {
  const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });

  const historyBlock = history.slice(-10).map(m =>
    `${m.speaker === 'me' ? `User (${myLanguage})` : `Other (${theirLanguage})`}: ${m.original}`
  ).join('\n');

  const systemPrompt = lastSpeaker === 'them'
    ? `You are an elite conversation coach.
Context: ${conversationContext}

The ${theirLanguage} speaker just spoke. Suggest 3 smart, natural replies the user (${myLanguage} speaker) should say next.

Guidelines:
1. Directly address what the other person just said.
2. Keep each suggestion under 10 words.
3. Format exactly: Suggestion 1 | Suggestion 2 | Suggestion 3`
    : `You are an elite conversation coach.
Context: ${conversationContext}

The user (${myLanguage} speaker) just spoke. Predict 3 likely things the ${theirLanguage} speaker might say next, so the user can prepare.

Guidelines:
1. Base predictions on the conversation flow and context.
2. Keep each prediction under 10 words.
3. Format exactly: Suggestion 1 | Suggestion 2 | Suggestion 3`;

  const userPrompt = lastSpeaker === 'them'
    ? `History:\n${historyBlock}\n\nWhat should I (${myLanguage}) say next?`
    : `History:\n${historyBlock}\n\nWhat might the ${theirLanguage} speaker say next?`;

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content ?? '';
  return content.split('|').map(s => s.trim().replace(/^Suggestion \d+: /i, '').replace(/^"/, '').replace(/"$/, ''));
}

