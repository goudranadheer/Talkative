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

  const systemPrompt = [
    `You are a precise real-time translator. Your only task is to translate the given text from ${fromLanguage} to ${toLanguage}.`,
    conversationContext ? `Conversation context: ${conversationContext}` : '',
    `Rules:
- Output the translation and NOTHING else. No labels, no quotes, no explanations, no preamble.
- Preserve the speaker's tone, formality level, and intent exactly.
- If an idiom or phrase has no direct equivalent, use the most natural expression in ${toLanguage}.
- Never translate names, brand names, or numbers — keep them as-is.`,
  ].filter(Boolean).join('\n\n');

  const userMessage = [
    historyBlock ? `Conversation so far:\n${historyBlock}\n` : '',
    `Translate to ${toLanguage}: ${text}`,
  ].join('');

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 256,
    temperature: 0,
  });

  let result = response.choices[0]?.message?.content ?? '';

  // Strip any model preamble the LLM occasionally adds despite instructions
  result = result
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^(translation|translated text|here is the translation)[:\s]+/i, '')
    .trim();

  return result;
}

// Called only when the other person just spoke — generates reply suggestions for the user
export async function generateSuggestions({
  history,
  conversationContext,
  myLanguage,
  theirLanguage,
  groqApiKey,
}: {
  history: Message[];
  conversationContext: string;
  myLanguage: string;
  theirLanguage: string;
  groqApiKey: string;
}): Promise<string[]> {
  const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });

  const historyBlock = history.slice(-10).map(m =>
    `${m.speaker === 'me' ? `You (${myLanguage})` : `Them (${theirLanguage})`}: ${m.original}`
  ).join('\n');

  const systemPrompt = `You are a real-time conversation coach.
${conversationContext ? `Context: ${conversationContext}` : ''}

The ${theirLanguage} speaker just spoke. Give the ${myLanguage} speaker 3 short, natural replies they can say out loud right now.

Output rules:
- Three phrases separated by " | " — nothing else. No numbering, no labels, no extra text.
- Each phrase must be under 10 words and sound like something a real person would naturally say.
- Directly respond to what was just said, using the conversation history for tone and context.
- Example format: Sure, let me check that | I understand, can you clarify | That works for me`;

  const userPrompt = `Conversation:\n${historyBlock}\n\nGive 3 replies for the ${myLanguage} speaker:`;

  const response = await client.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 120,
  });

  const content = response.choices[0]?.message?.content ?? '';
  return content
    .split('|')
    .map(s => s.trim()
      .replace(/^(suggestion|reply|response|option|prediction)\s*\d*[:.]\s*/i, '')
      .replace(/^["']|["']$/g, '')
    )
    .filter(s => s.length > 0)
    .slice(0, 3);
}

