# Talkative

A real-time bilingual conversation translator for Android and iOS. Built for the **director use case** — you're the one facilitating a conversation between two people who don't share a language, and you need to understand both sides and know exactly what to say.

---

## How It Works

1. **Brief** the app before the conversation — give it context (e.g. "job interview", "doctor's appointment") or use the **Deep Briefing** mode where an AI coach interviews you to build a full picture of the encounter.
2. **Start the session** — tap the mic to go hands-free.
3. **Talk naturally** — the app listens continuously, detects which language was spoken, transcribes it, and translates it automatically.
4. **Follow the suggestions** — after every utterance the app tells you what to say next (or predicts what the other person might say so you can prepare).

---

## Features

- **Hands-free mic mode** — continuous 5-second audio chunks, no button holding required
- **Auto speaker detection** — Whisper detects the language and automatically attributes each utterance to the correct speaker
- **Contextual AI suggestions**
  - When *they* speak → suggests what *you* should say next
  - When *you* speak → predicts likely responses from them so you can prepare
- **Two translation modes**
  - `Free` — MyMemory API, no key required
  - `Reasoning` — Groq LLM (llama-3.1-8b-instant) with full conversation history for context-aware translation
- **Deep Briefing** — AI coach interviews you before the conversation to anticipate friction points and build strategy
- **TTS earpiece output** — translations are spoken aloud so you can hear them without looking at the screen
- **Replay any message** — tap the play button on any bubble to hear it again

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo SDK 54) |
| Navigation | React Navigation v7 |
| Speech-to-Text | Groq Whisper (`whisper-large-v3-turbo`) |
| LLM | Groq (`llama-3.1-8b-instant`, `llama-3.3-70b-versatile`) |
| Free Translation | MyMemory API |
| Text-to-Speech | expo-speech |
| Audio Recording | expo-av |
| Build | EAS Build |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo`)
- A free [Groq API key](https://console.groq.com) — unlocks mic input, AI translation, and suggestions. Text-only mode works without it.

### Install & Run

```bash
git clone https://github.com/goudranadheer/Talkative.git
cd Talkative
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone, or run on an emulator.

### Build (Android APK)

```bash
eas build --platform android --profile preview
```

---

## App Flow

```
BriefingScreen
  ├── Select languages (yours + theirs)
  ├── Choose briefing mode: Brief | Detailed
  ├── Choose translation mode: Free | Reasoning
  └── Enter Groq API key (optional)
        │
        ├── [Brief mode] ──────────────→ ConversationScreen
        │
        └── [Detailed mode] → DetailedBriefingScreen
                                  (AI coach interview)
                                        │
                                        └──────────────→ ConversationScreen
```

---

## Environment

No `.env` file needed. The Groq API key is entered directly in the app and stored in memory for the session only — it is never persisted to disk.

---

## License

MIT
