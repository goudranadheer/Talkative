// Speech-to-text using Groq Whisper (free tier)
// Accepts a local file URI from expo-av and returns transcript + detected language

type STTResult = {
  text: string;
  detectedLanguage: string; // e.g. "en", "de", "es"
};

export async function transcribe(audioUri: string, groqApiKey: string): Promise<STTResult> {
  // Use a more robust way to handle the local file for FormData in React Native
  const formData = new FormData();

  // React Native's Fetch has issues with some blob/file formats.
  // Using the URI directly in FormData is the standard way.
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);

  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Accept': 'application/json',
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`STT failed: ${err}`);
  }

  const data = await response.json();

  return {
    text: data.text?.trim() ?? '',
    detectedLanguage: data.language ?? 'unknown',
  };
}
