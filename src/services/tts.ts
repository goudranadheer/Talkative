import * as Speech from 'expo-speech';

// Maps our language codes to BCP-47 locale tags for expo-speech
const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  ru: 'ru-RU',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-SA',
  hi: 'hi-IN',
  tr: 'tr-TR',
  pl: 'pl-PL',
};

export async function speak(text: string, langCode: string): Promise<void> {
  const locale = LANG_TO_LOCALE[langCode] ?? 'en-US';

  // Stop any current speech before starting new one
  await Speech.stop();

  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: locale,
      pitch: 1.0,
      rate: 0.9,
      onDone: resolve,
      onError: reject,
    });
  });
}

export function stopSpeech() {
  Speech.stop();
}
