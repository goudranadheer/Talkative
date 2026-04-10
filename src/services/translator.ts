import { Message } from '../context/AppContext';

type TranslateParams = {
  text: string;
  fromLangCode: string;
  toLangCode: string;
  history?: Message[];
};

// MyMemory free translation API — no key needed
export async function translate({ text, fromLangCode, toLangCode, history }: TranslateParams): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLangCode}|${toLangCode}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Translation request failed');

  const data = await res.json();

  if (data.responseStatus !== 200) {
    throw new Error(data.responseDetails || 'Translation failed');
  }

  return data.responseData.translatedText;
}
