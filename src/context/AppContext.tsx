import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export type Language = {
  label: string;
  value: string;
  name: string;
};

export type BriefingConfig = {
  myLanguage: Language | null;
  theirLanguage: Language | null;
  context: string;
  detailedContext?: string;
  mode: 'brief' | 'detailed';
};

export type Message = {
  id: string;
  speaker: 'me' | 'them';
  original: string;
  translated: string;
  timestamp: Date;
};

export type Profile = {
  quotaUnits: number;
  usedUnits: number;
};

type AppContextType = {
  briefing: BriefingConfig;
  setBriefing: (b: BriefingConfig) => void;
  messages: Message[];
  addMessage: (m: Message) => void;
  clearMessages: () => void;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  session: Session | null;
  sessionLoading: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [briefing, setBriefing] = useState<BriefingConfig>({
    myLanguage: null,
    theirLanguage: null,
    context: '',
    mode: 'brief',
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function refreshProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('quota_units, used_units')
      .single();
    if (data) {
      setProfile({ quotaUnits: data.quota_units, usedUnits: data.used_units });
    }
  }

  useEffect(() => {
    if (session) refreshProfile();
    else setProfile(null);
  }, [session?.user.id]);

  async function signOut() {
    await supabase.auth.signOut();
    setMessages([]);
  }

  const addMessage = (m: Message) => setMessages(prev => [...prev, m]);
  const clearMessages = () => setMessages([]);

  return (
    <AppContext.Provider value={{
      briefing, setBriefing,
      messages, addMessage, clearMessages,
      ttsEnabled, setTtsEnabled,
      session, sessionLoading,
      profile, refreshProfile,
      signOut,
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
