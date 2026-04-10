import Anthropic from '@anthropic-ai/sdk';
import { Message } from '../context/AppContext';

type TranslateParams = {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  conversationContext: string;
  history: Message[];
  apiKey: string;
};

export async function translate({
  text,
  fromLanguage,
  toLanguage,
  conversationContext,
  history,
  apiKey,
}: TranslateParams): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = buildSystemPrompt(fromLanguage, toLanguage, conversationContext);
  const historyContext = buildHistoryContext(history);

  const userMessage = historyContext
    ? `Previous conversation:\n${historyContext}\n\nNow translate this:\n"${text}"`
    : `Translate this:\n"${text}"`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text.trim();
}

function buildSystemPrompt(from: string, to: string, context: string): string {
  let prompt = `You are a real-time conversation translator.
Your job is to translate spoken text from ${from} to ${to}.

Rules:
- Output ONLY the translated text. No explanations, no quotes, no extra commentary.
- Preserve the speaker's tone, formality, and intent.
- Keep translations natural and conversational, not literal.
- If the input is already in ${to}, still output it as-is.`;

  if (context) {
    prompt += `\n\nConversation context: ${context}\nUse this context to make translations more accurate and relevant.`;
  }

  return prompt;
}

function buildHistoryContext(history: Message[]): string {
  if (history.length === 0) return '';
  return history
    .slice(-6) // last 3 exchanges
    .map(m => `${m.speaker === 'me' ? 'Me' : 'Them'}: ${m.original} → ${m.translated}`)
    .join('\n');
}
