import { useRef, useState, useCallback, useEffect } from 'react';
import { playPCM16Chunks, stopCurrentAudio } from '../utils/audioUtils';
import { UserProfile, SITUATION_BRIEFINGS } from '../services/memoryService';

type SessionStatus = 'disconnected' | 'connecting' | 'ready' | 'translating' | 'speaking' | 'error';

type UseRealtimeSessionOptions = {
  profile: UserProfile;
  onTranscript?: (text: string) => void;
  onError?: (msg: string) => void;
};

export function useRealtimeSession({ profile, onTranscript, onError }: UseRealtimeSessionOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioChunksRef = useRef<string[]>([]);
  const pendingRef = useRef<{ text: string; resolve: () => void; reject: (e: Error) => void } | null>(null);
  const [status, setStatus] = useState<SessionStatus>('disconnected');

  function buildSystemPrompt(p: UserProfile): string {
    const situationBriefing = SITUATION_BRIEFINGS[p.currentSituation];
    const nameClause = p.name ? `The student's name is ${p.name}.` : '';
    const cityClause = p.city ? `They live in ${p.city}, Germany.` : 'They are living in Germany.';
    const contextClause = p.customContext ? `Additional context: ${p.customContext}.` : '';

    return [
      `You are a real-time AI interpreter for an international student in Germany.`,
      nameClause,
      cityClause,
      `Their native language is ${p.nativeLanguageName}. Their German level is ${p.germanLevel}.`,
      situationBriefing,
      contextClause,
      `Your job: when given German text, translate it naturally and speak it in ${p.nativeLanguageName}.`,
      `Rules:`,
      `- Speak the translation directly — no preamble like "The translation is...".`,
      `- If the statement requires urgent action (e.g. "Please go to counter 3"), add a brief actionable note after the translation.`,
      `- Keep the tone calm and clear.`,
      `- Preserve formality level of the original.`,
    ].filter(Boolean).join(' ');
  }

  const connect = useCallback(() => {
    if (!profile.openAiKey) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    audioChunksRef.current = [];

    // React Native supports a third options argument for headers, but TS types don't declare it
    const WS = WebSocket as any;
    const ws: WebSocket = new WS(
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      undefined,
      { headers: { Authorization: `Bearer ${profile.openAiKey}`, 'OpenAI-Beta': 'realtime=v1' } }
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['audio', 'text'],
          voice: 'alloy',
          output_audio_format: 'pcm16',
          input_audio_format: 'pcm16',
          turn_detection: null,
          instructions: buildSystemPrompt(profile),
        },
      }));
      setStatus('ready');
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === 'response.audio.delta') {
          audioChunksRef.current.push(msg.delta);
        }

        if (msg.type === 'response.audio_transcript.delta' && onTranscript) {
          onTranscript(msg.delta);
        }

        if (msg.type === 'response.done') {
          const chunks = [...audioChunksRef.current];
          audioChunksRef.current = [];

          if (chunks.length > 0) {
            setStatus('speaking');
            try {
              await playPCM16Chunks(chunks);
            } catch (_) {}
          }

          setStatus('ready');
          pendingRef.current?.resolve();
          pendingRef.current = null;
        }

        if (msg.type === 'error') {
          const errMsg = msg.error?.message ?? 'Realtime API error';
          setStatus('error');
          onError?.(errMsg);
          pendingRef.current?.reject(new Error(errMsg));
          pendingRef.current = null;
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      setStatus('error');
      onError?.('Connection error. Check your OpenAI API key.');
      pendingRef.current?.reject(new Error('WebSocket error'));
      pendingRef.current = null;
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
    };

    wsRef.current = ws;
  }, [profile.openAiKey, profile.currentSituation, profile.nativeLanguageName]);

  const disconnect = useCallback(() => {
    stopCurrentAudio().catch(() => {});
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const updateSession = useCallback((p: UserProfile) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: 'session.update',
      session: { instructions: buildSystemPrompt(p) },
    }));
  }, []);

  const translate = useCallback((germanText: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      audioChunksRef.current = [];
      pendingRef.current = { text: germanText, resolve, reject };
      setStatus('translating');

      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: `Translate and speak: "${germanText}"` }],
        },
      }));

      ws.send(JSON.stringify({ type: 'response.create' }));
    });
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      audioChunksRef.current = [];
      pendingRef.current = { text, resolve, reject };
      setStatus('speaking');

      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }));

      ws.send(JSON.stringify({ type: 'response.create' }));
    });
  }, []);

  // Auto-reconnect when key changes
  useEffect(() => {
    if (profile.openAiKey) {
      connect();
    }
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [profile.openAiKey]);

  return { status, connect, disconnect, translate, speak, updateSession };
}
