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

// Called only when the other person just spoke.
// Acts as an agent for the user — generates responses that advance their goal.
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

  // Use translated text throughout so the model always works in the user's language.
  // m.original for 'them' is in their language (e.g. Hindi) — use m.translated (English).
  // m.original for 'me' is already the English suggestion the user tapped.
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

  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 150,
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

