import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert, Linking } from 'react-native';

type RecorderState = 'idle' | 'recording' | 'processing';

const SPEECH_THRESHOLD_DB = -35;  // above this = someone is speaking
const SILENCE_DURATION_MS  = 1200; // silence must last this long after speech ends
const MIN_RECORDING_MS     = 400;  // ignore the first 400ms (mic startup noise)

export function useAudioRecorder() {
  const recordingRef    = useRef<Audio.Recording | null>(null);
  const [state, setState] = useState<RecorderState>('idle');

  const onSilenceRef        = useRef<(() => void) | null>(null);
  const silenceFiredRef     = useRef(false);  // prevent double-fire
  const speechDetectedRef   = useRef(false);  // true once audio > threshold seen
  const silenceStartRef     = useRef<number | null>(null);
  const recordingStartRef   = useRef<number>(0);

  async function startRecording(onSilenceDetected?: () => void) {
    try {
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Microphone Permission Required',
            'Enable microphone access in Settings → Apps → Talkative → Permissions.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert('Permission Denied', 'Microphone access is needed to use the mic feature.');
        }
        setState('idle');
        return;
      }

      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
        recordingRef.current = null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Reset all detection state for this session
      onSilenceRef.current      = onSilenceDetected ?? null;
      silenceFiredRef.current   = false;
      speechDetectedRef.current = false;
      silenceStartRef.current   = null;
      recordingStartRef.current = Date.now();

      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          android: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
          },
          ios: {
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 128000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
        },
        (status) => {
          if (!status.isRecording || silenceFiredRef.current) return;

          const elapsed = Date.now() - recordingStartRef.current;
          if (elapsed < MIN_RECORDING_MS) return;

          const db = status.metering ?? -160;

          if (db >= SPEECH_THRESHOLD_DB) {
            // ── Speech detected ──────────────────────────────────────────────
            speechDetectedRef.current = true;
            silenceStartRef.current   = null; // reset silence timer while talking
          } else if (speechDetectedRef.current) {
            // ── Silence after speech ─────────────────────────────────────────
            // Only start the silence timer once we've confirmed real speech.
            // This prevents firing on ambient noise or an empty room.
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
              silenceFiredRef.current = true;
              onSilenceRef.current?.();
            }
          }
          // If db < threshold AND speechDetectedRef is false → pure silence,
          // no speech yet → do nothing, keep recording and waiting.
        },
        100 // poll every 100ms
      );

      recordingRef.current = recording;
      setState('recording');
    } catch (e) {
      setState('idle');
      recordingRef.current = null;
      throw e;
    }
  }

  async function stopRecording(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) return null;

    onSilenceRef.current    = null;
    silenceFiredRef.current = true;

    setState('processing');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      return uri ?? null;
    } finally {
      setState('idle');
    }
  }

  // Discards current recording without processing — used when user is about to speak.
  async function cancelRecording(): Promise<void> {
    const recording = recordingRef.current;
    if (!recording) return;
    onSilenceRef.current    = null;
    silenceFiredRef.current = true;
    try { await recording.stopAndUnloadAsync(); } catch (_) {}
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) {}
    recordingRef.current = null;
    setState('idle');
  }

  return { state, startRecording, stopRecording, cancelRecording };
}
