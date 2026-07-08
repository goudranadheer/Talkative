// All AI work goes through the Supabase edge functions — the app never holds
// provider API keys. Each request carries the user's session JWT; the backend
// enforces the per-user free quota (402 → quota_exhausted).
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { Message } from '../context/AppContext';

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
  }
}

export const QUOTA_MESSAGE = 'Your free minutes are used up — paid top-ups are coming soon.';

async function post(fn: 'transcribe' | 'ai', body: FormData | object): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('Not signed in.', 'unauthorized', 401);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let payload: any = body;
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers,
    body: payload,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 402 || json?.error === 'quota_exhausted') {
      throw new ApiError(QUOTA_MESSAGE, 'quota_exhausted', res.status);
    }
    throw new ApiError(json?.detail || json?.error || `Request failed (${res.status})`, json?.error, res.status);
  }
  return json;
}

function slimHistory(history: Message[]) {
  return history.map(m => ({
    speaker: m.speaker,
    original: m.original,
    translated: m.translated,
  }));
}

export async function transcribeAudio(
  audioUri: string,
): Promise<{ text: string; detectedLanguage: string }> {
  const form = new FormData();
  form.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  const data = await post('transcribe', form);
  return { text: data.text ?? '', detectedLanguage: data.detectedLanguage ?? 'unknown' };
}

export async function aiTranslate(params: {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  myLanguage: string;
  theirLanguage: string;
  conversationContext: string;
  history: Message[];
}): Promise<string> {
  const data = await post('ai', {
    task: 'translate',
    ...params,
    history: slimHistory(params.history),
  });
  return data.text ?? '';
}

export async function aiSuggest(params: {
  myLanguage: string;
  theirLanguage: string;
  conversationContext: string;
  history: Message[];
}): Promise<string[]> {
  const data = await post('ai', {
    task: 'suggest',
    ...params,
    history: slimHistory(params.history),
  });
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

export async function aiCoach(params: {
  myLanguage: string;
  theirLanguage: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  const data = await post('ai', { task: 'coach', ...params });
  return data.text ?? '';
}
