export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
}

export function wordOverlapRatio(transcribed: string, reference: string): number {
  const transcriptWords = normalizeWords(transcribed);
  if (transcriptWords.length === 0) return 0;

  const referenceWords = new Set(normalizeWords(reference));
  const matches = transcriptWords.filter(word => referenceWords.has(word)).length;
  return matches / transcriptWords.length;
}

export function isLikelyEcho(
  transcribed: string,
  reference: string | null | undefined,
  threshold = 0.5,
): boolean {
  if (!reference) return false;
  return wordOverlapRatio(transcribed, reference) >= threshold;
}
