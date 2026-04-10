// Speech-to-text using Groq Whisper (free tier)
// Accepts a local file URI from expo-av and returns transcript + detected language

type STTResult = {
  text: string;
  detectedLanguage: string; // e.g. "en", "de", "es"
};

export async function transcribe(audioUri: string, groqApiKey: string): Promise<STTResult> {
  // Fetch the recorded audio file as a blob
  const fileResponse = await fetch(audioUri);
  const blob = await fileResponse.blob();

  const formData = new FormData();
  formData.append('file', blob as any, 'recording.m4a');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json'); // includes detected language
  formData.append('temperature', '0');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
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
