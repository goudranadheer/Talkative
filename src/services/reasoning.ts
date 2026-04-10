import Groq from 'groq-sdk';
import { Message } from '../context/AppContext';

type ReasonParams = {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  conversationContext: string;
  history: Message[];
  groqApiKey: string;
};

// Groq free tier — DeepSeek R1 reasoning model for context-aware translation
export async function translateWithReasoning({
  text,
  fromLanguage,
  toLanguage,
  conversationContext,
  history,
  groqApiKey,
}: ReasonParams): Promise<string> {
  const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });

  const historyBlock = history.slice(-6).map(m =>
    `${m.speaker === 'me' ? fromLanguage : toLanguage}: "${m.original}" → "${m.translated}"`
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
    model: 'deepseek-r1-distill-llama-70b',
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
