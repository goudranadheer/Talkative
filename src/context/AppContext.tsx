import React, { createContext, useContext, useState } from 'react';

export type Language = {
  label: string;
  value: string;
  name: string;
};

export type BriefingConfig = {
  myLanguage: Language | null;
  theirLanguage: Language | null;
  context: string;
};

export type Message = {
  id: string;
  speaker: 'me' | 'them';
  original: string;
  translated: string;
  timestamp: Date;
};

export type TranslationMode = 'free' | 'reasoning';

type AppContextType = {
  briefing: BriefingConfig;
  setBriefing: (b: BriefingConfig) => void;
  messages: Message[];
  addMessage: (m: Message) => void;
  clearMessages: () => void;
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  translationMode: TranslationMode;
  setTranslationMode: (mode: TranslationMode) => void;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [briefing, setBriefing] = useState<BriefingConfig>({
    myLanguage: null,
    theirLanguage: null,
    context: '',
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [groqApiKey, setGroqApiKey] = useState('');
  const [translationMode, setTranslationMode] = useState<TranslationMode>('free');
  const [ttsEnabled, setTtsEnabled] = useState(true);

  const addMessage = (m: Message) => setMessages(prev => [...prev, m]);
  const clearMessages = () => setMessages([]);

  return (
    <AppContext.Provider value={{
      briefing, setBriefing,
      messages, addMessage, clearMessages,
      groqApiKey, setGroqApiKey,
      translationMode, setTranslationMode,
      ttsEnabled, setTtsEnabled,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
