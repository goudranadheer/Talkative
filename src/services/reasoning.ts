import Groq from 'groq-sdk';
import { Message } from '../context/AppContext';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
// Verify model IDs at platform.deepseek.com — update to 'deepseek-v4-flash' once confirmed available
const DEEPSEEK_FAST_MODEL = 'deepseek-chat';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function callDeepSeek(
  messages: ChatMessage[],
  options: { model?: string; max_tokens?: number; temperature?: number },
  apiKey: string,
): Promise<string> {
  const res = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? DEEPSEEK_FAST_MODEL,
      messages,
      max_tokens: options.max_tokens ?? 512,
      temperature: options.temperature ?? 0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API failed: ${err}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
}

async function callGroqLlm(
  messages: ChatMessage[],
  options: { model: string; max_tokens?: number; temperature?: number },
  apiKey: string,
): Promise<string> {
  const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.chat.completions.create({
    model: options.model,
    messages,
    max_tokens: options.max_tokens,
    temperature: options.temperature ?? 0,
  });
  return response.choices[0]?.message?.content ?? '';
}

type ReasonParams = {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  myLanguage: string;
  theirLanguage: string;
  conversationContext: string;
  history: Message[];
  groqApiKey: string;
  deepseekApiKey?: string;
};

export async function translateWithReasoning({
  text,
  fromLanguage,
  toLanguage,
  myLanguage,
  theirLanguage,
  conversationContext,
  history,
  groqApiKey,
  deepseekApiKey,
}: ReasonParams): Promise<string> {
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

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let result: string;

  if (deepseekApiKey) {
    result = await callDeepSeek(messages, { max_tokens: 256, temperature: 0 }, deepseekApiKey);
  } else {
    result = await callGroqLlm(messages, { model: 'llama-3.1-8b-instant', max_tokens: 256, temperature: 0 }, groqApiKey);
  }

  result = result
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^(translation|translated text|here is the translation)[:\s]+/i, '')
    .trim();

  return result;
}

export async function generateSuggestions({
  history,
  conversationContext,
  myLanguage,
  theirLanguage,
  groqApiKey,
  deepseekApiKey,
}: {
  history: Message[];
  conversationContext: string;
  myLanguage: string;
  theirLanguage: string;
  groqApiKey: string;
  deepseekApiKey?: string;
}): Promise<string[]> {
  const historyBlock = history.slice(-10).map(m =>
    m.speaker === 'me'
      ? `User (${myLanguage}): ${m.original}`
      : `Other person (${theirLanguage}): ${m.translated}`
  ).join('\n');

  const lastTheirMessage = history.filter(m => m.speaker === 'them').slice(-1)[0];

  const systemPrompt = `You are an intelligent agent speaking on behalf of the user in a live conversation. Your only purpose is to help them achieve their goal.

User's goal: ${conversationContext || 'Have a productive conversation'}

The other person just spoke. Decide the 3 best things the user should say right now in ${myLanguage} to move closer to their goal.

How to think:
- What does the user ultimately want from this conversation?
- Does this latest message help or hinder that goal?
- What response advances the user's position most effectively?
- If they were asked a question, answer it in a way that serves the user's interests.
- If an offer or statement was made, respond strategically, not just politely.

Output rules:
- Write ONLY in ${myLanguage}.
- Three responses separated by " | " — nothing else. No labels, no numbering, no extra text.
- Each response must be under 15 words and sound natural when spoken aloud.
- Order them: most assertive/direct first, softer alternative second, clarifying question third.
- Example for salary negotiation: I was expecting closer to 50,000 | Can we discuss the full package? | What is the range for this role?`;

  const userPrompt = [
    historyBlock ? `Conversation so far:\n${historyBlock}` : '',
    lastTheirMessage ? `\nThey just said: "${lastTheirMessage.translated}"` : '',
    `\nWhat should the user say in ${myLanguage} to advance their goal?`,
  ].join('');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  let content: string;

  if (deepseekApiKey) {
    content = await callDeepSeek(messages, { max_tokens: 150, temperature: 0.5 }, deepseekApiKey);
  } else {
    content = await callGroqLlm(messages, { model: 'llama-3.3-70b-versatile', max_tokens: 150, temperature: 0.5 }, groqApiKey);
  }

  return content
    .split('|')
    .map(s => s.trim()
      .replace(/^(suggestion|reply|response|option|prediction)\s*\d*[:.]\s*/i, '')
      .replace(/^["']|["']$/g, '')
    )
    .filter(s => s.length > 0)
    .slice(0, 3);
}
