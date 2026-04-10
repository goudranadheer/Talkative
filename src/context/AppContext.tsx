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

type AppContextType = {
  briefing: BriefingConfig;
  setBriefing: (b: BriefingConfig) => void;
  messages: Message[];
  addMessage: (m: Message) => void;
  clearMessages: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [briefing, setBriefing] = useState<BriefingConfig>({
    myLanguage: null,
    theirLanguage: null,
    context: '',
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiKey, setApiKey] = useState('');

  const addMessage = (m: Message) => setMessages(prev => [...prev, m]);
  const clearMessages = () => setMessages([]);

  return (
    <AppContext.Provider value={{ briefing, setBriefing, messages, addMessage, clearMessages, apiKey, setApiKey }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
