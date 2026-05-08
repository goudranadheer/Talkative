import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Audio } from 'expo-av';

function buildWavHeader(pcmByteLength: number, sampleRate = 24000, channels = 1, bitsPerSample = 16): number[] {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  const toBytes32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  const toBytes16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];

  return [
    // RIFF
    0x52, 0x49, 0x46, 0x46,
    ...toBytes32(36 + pcmByteLength),
    0x57, 0x41, 0x56, 0x45,
    // fmt
    0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00,
    ...toBytes16(1),
    ...toBytes16(channels),
    ...toBytes32(sampleRate),
    ...toBytes32(byteRate),
    ...toBytes16(blockAlign),
    ...toBytes16(bitsPerSample),
    // data
    0x64, 0x61, 0x74, 0x61,
    ...toBytes32(pcmByteLength),
  ];
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): number[] {
  const clean = base64.replace(/=/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_CHARS.indexOf(clean[i]);
    const b = BASE64_CHARS.indexOf(clean[i + 1] ?? 'A');
    const c = BASE64_CHARS.indexOf(clean[i + 2] ?? 'A');
    const d = BASE64_CHARS.indexOf(clean[i + 3] ?? 'A');
    bytes.push((a << 2) | (b >> 4));
    if (i + 2 < clean.length) bytes.push(((b & 0xf) << 4) | (c >> 2));
    if (i + 3 < clean.length) bytes.push(((c & 0x3) << 6) | d);
  }
  return bytes;
}

function bytesToBase64(bytes: number[]): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    result += BASE64_CHARS[a >> 2];
    result += BASE64_CHARS[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b & 0xf) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[c & 0x3f] : '=';
  }
  return result;
}

let currentSound: Audio.Sound | null = null;

export async function stopCurrentAudio(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch (_) {}
    currentSound = null;
  }
}

export async function playPCM16Chunks(base64Chunks: string[], sampleRate = 24000): Promise<void> {
  await stopCurrentAudio();

  const allPcmBytes: number[] = [];
  for (const chunk of base64Chunks) {
    allPcmBytes.push(...base64ToBytes(chunk));
  }

  const header = buildWavHeader(allPcmBytes.length, sampleRate);
  const wavBytes = [...header, ...allPcmBytes];
  const wavBase64 = bytesToBase64(wavBytes);

  const uri = (cacheDirectory ?? '') + 'rt_output.wav';
  await writeAsStringAsync(uri, wavBase64, { encoding: EncodingType.Base64 });

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });

  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  currentSound = sound;

  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && (status.didJustFinish || !status.isPlaying && status.positionMillis > 0)) {
        sound.unloadAsync().catch(() => {});
        currentSound = null;
        resolve();
      }
    });
  });
}
