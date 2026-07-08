# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

Talkative is a real-time bilingual conversation translator (Expo / React Native, TypeScript) for live two-person conversations. The phone sits between two people speaking different languages: it listens hands-free, transcribes each utterance (Groq Whisper), figures out who spoke, translates with Claude Haiku 4.5 using the conversation history and the user's stated goal, speaks the translation aloud (expo-speech), and suggests 3 strategic replies for the user.

**All AI calls go through a Supabase backend** — the app holds no provider API keys. Users sign in with email + password (Supabase Auth, auto-confirm — no emails sent; free tier locks email templates without custom SMTP) and get a free per-account quota (300 utterances). Provider keys live only in edge-function secrets.

## Commands

```bash
npx expo start --clear          # dev server (--clear needed after .env changes)
npx expo run:android            # build + run on USB device (needs JAVA_HOME → Android Studio jbr)
npx eas-cli build --profile preview --platform android   # standalone APK
npx tsc --noEmit                # typecheck (no lint or unit test setup exists)

# Backend deploy (see SETUP.md for the full one-time flow):
npx supabase db push
npx supabase functions deploy transcribe && npx supabase functions deploy ai
npx supabase secrets set GROQ_API_KEY=... ANTHROPIC_API_KEY=...
```

App config: copy `.env.example` to `.env` with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public values, inlined by babel-preset-expo).

## Architecture

The whole app is one pipeline orchestrated by `src/screens/ConversationScreen.tsx`:

**mic (useAudioRecorder) → `transcribe` edge fn (Whisper) → speaker detection (speaker.ts) → `ai` edge fn task=translate (Claude) → TTS (tts.ts) + task=suggest (fired in parallel with TTS) → restart mic**

### Backend (supabase/)

- `migrations/` — `profiles` (per-user `quota_units`/`used_units`, auto-created by trigger on signup), `usage_events` log, and atomic `consume_units` RPC (returns -1 when exhausted).
- `functions/transcribe` — multipart audio → Groq Whisper (`whisper-large-v3-turbo`). Quota-gated but does not consume units.
- `functions/ai` — builds all prompts **server-side** (so it can't be abused as a generic Claude relay) and calls `claude-haiku-4-5` via REST. Tasks: `translate` (consumes 1 unit per utterance — the only consumer), `suggest`, `coach`. Quota exhaustion returns 402 → `ApiError` with code `quota_exhausted` in the app.
- `functions/_shared/auth.ts` — JWT → user resolution, quota helpers, usage logging.
- Deno code — excluded from the app's `tsc` run via `tsconfig.json` `exclude`.

### App-side behaviors that are easy to break

- **VAD / recording loop** (`src/hooks/useAudioRecorder.ts`): expo-av metering every 100ms. The noise-floor threshold is calibrated once (1.5s sample on the very first recording) and **persisted in `savedThresholdRef` across recording restarts** — recalibrating on every utterance previously created a 1.9s dead zone that merged consecutive utterances. Silence for 900ms ends an utterance; the screen's `handleSilenceDetected` callback stops the recording, processes it, and immediately starts a new one so no speech is missed.
- **Speaker detection** (`src/services/speaker.ts`): Whisper's detected language matched against the two briefing languages; if ambiguous (same language), falls back to TTS timing — if the app finished speaking <3s ago, attribute the utterance to the other person.
- **Echo-loop prevention**: `ConversationScreen` discards a transcription if it overlaps ≥50% word-wise with a recently shown suggestion or the TTS output.
- **Quota handling**: a `quota_exhausted` `ApiError` must stop the mic loop (`handleQuotaExhausted`) — otherwise the VAD keeps queueing utterances that can only fail.
- **State** (`src/context/AppContext.tsx`): briefing config, message list, TTS toggle, plus Supabase `session` (persisted via AsyncStorage) and `profile` quota. `App.tsx` gates: loading spinner → `AuthScreen` (no session) → navigator.
- **Prompt changes** happen in `supabase/functions/ai/index.ts` (redeploy the function), not in the app.

### UI theme

All screens share the futuristic neon theme in `src/constants/theme.ts` (deep-space bg, cyan `#00E5FF` primary, violet `#7C4DFF` accent, glow shadows, wide-tracked uppercase HUD labels) and `src/components/GradientButton.tsx`. New UI should use these tokens, not hard-coded colors.

## Constraints to respect

- STT is file-based (whole-utterance), not streaming — don't attempt word-by-word live transcription with Groq Whisper.
- Audio format is fixed at .m4a, 44.1kHz mono AAC 128kbps — Whisper accepts it and expo-av produces it on both platforms.
- LLM prompts demand bare output (translation only / `a | b | c` suggestions); the edge function strips labels and quotes defensively. Keep output-format rules in prompts strict.
- Auth is password-based with auto-confirm because the free tier can't customize email templates without custom SMTP. Don't switch back to OTP codes unless SMTP is configured and the Magic Link template contains `{{ .Token }}` (see SETUP.md).
- README.md documents features and limitations in detail — update it when behavior changes.
