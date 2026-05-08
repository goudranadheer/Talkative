import AsyncStorage from '@react-native-async-storage/async-storage';

export type Situation =
  | 'government_office'
  | 'medical'
  | 'pharmacy'
  | 'university'
  | 'transport'
  | 'supermarket'
  | 'restaurant'
  | 'bank'
  | 'social'
  | 'home'
  | 'unknown';

export type UserProfile = {
  nativeLanguage: string;
  nativeLanguageName: string;
  name: string;
  city: string;
  openAiKey: string;
  groqApiKey: string;
  germanLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  wordsHeard: number;
  sessionsCompleted: number;
  currentSituation: Situation;
  customContext: string;
};

const KEY = 'talkative_v2_profile';

export const DEFAULT_PROFILE: UserProfile = {
  nativeLanguage: 'en',
  nativeLanguageName: 'English',
  name: '',
  city: '',
  openAiKey: '',
  groqApiKey: '',
  germanLevel: 'A1',
  wordsHeard: 0,
  sessionsCompleted: 0,
  currentSituation: 'unknown',
  customContext: '',
};

export async function loadProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = await loadProfile();
  const updated = { ...current, ...updates };
  await saveProfile(updated);
  return updated;
}

export const SITUATION_LABELS: Record<Situation, string> = {
  government_office: 'Government Office',
  medical: 'Doctor / Clinic',
  pharmacy: 'Pharmacy',
  university: 'University',
  transport: 'Transport',
  supermarket: 'Supermarket',
  restaurant: 'Restaurant / Café',
  bank: 'Bank',
  social: 'Social',
  home: 'Home',
  unknown: 'General',
};

export const SITUATION_BRIEFINGS: Record<Situation, string> = {
  government_office:
    'You are at a German government office (e.g. Ausländerbehörde, Bürgeramt). ' +
    'Be very precise with translations. Official instructions, form fields, and deadlines are critical. ' +
    'If there are form fields visible, explain what each one asks for.',
  medical:
    'You are at a German medical facility. Translate symptoms, diagnoses, and instructions accurately. ' +
    'Clarify medical terms. Patient safety is the priority.',
  pharmacy:
    'You are at a German pharmacy (Apotheke). Translate medication names, dosage instructions, and side effects clearly.',
  university:
    'You are at a German university. The student may encounter academic German. ' +
    'Translate lectures, administrative instructions, and student communications.',
  transport:
    'You are at a German transport hub. Translate announcements, signs, ticket machine instructions, and platform information.',
  supermarket:
    'You are at a German supermarket. Translate product labels, ingredients, allergens, and cashier questions.',
  restaurant:
    'You are at a German restaurant or café. Translate menus, waiter questions, and ordering phrases.',
  bank:
    'You are at a German bank. Translate banking terms, account information, and financial instructions precisely.',
  social:
    'You are in a social setting in Germany. Help with casual conversation, cultural references, and small talk.',
  home:
    'The student is at home dealing with German correspondence, landlord communication, or household matters.',
  unknown:
    'You are helping an international student navigate daily life in Germany.',
};
