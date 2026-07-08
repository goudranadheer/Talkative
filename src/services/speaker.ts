export type EnrolledSpeaker = {
  label: 'me' | 'them';
  detectedLanguage: string; // e.g. 'en', 'hi', 'de'
};

// Multi-signal speaker detection.
// Priority order:
//   1. Unambiguous enrollment match (enrolled languages differ → clear winner)
//   2. TTS timing (within 3s of app speaking → other person is responding)
//   3. Briefing language fallback (original language-code comparison)
export function detectSpeaker(
  detectedLanguage: string,
  enrollment: { me: EnrolledSpeaker | null; them: EnrolledSpeaker | null },
  myLangCode: string,
  lastTTSEndTime: number | null,
): 'me' | 'them' {
  const lang        = detectedLanguage.toLowerCase().split('-')[0];
  const myEnrolled  = enrollment.me?.detectedLanguage.toLowerCase().split('-')[0];
  const themEnrolled = enrollment.them?.detectedLanguage.toLowerCase().split('-')[0];

  // Unambiguous: enrolled languages differ → match against them
  if (myEnrolled && themEnrolled && myEnrolled !== themEnrolled) {
    if (lang === themEnrolled) return 'them';
    if (lang === myEnrolled)   return 'me';
  }

  // Ambiguous (same language or no enrollment): use TTS timing.
  // If the app just finished speaking (TTS) within 3s, the other person is likely responding.
  if (lastTTSEndTime !== null && Date.now() - lastTTSEndTime < 3000) {
    return 'them';
  }

  // Final fallback: match against the briefing language setting
  if (lang === myLangCode) return 'me';
  return 'them';
}
