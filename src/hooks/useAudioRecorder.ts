import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert, Linking } from 'react-native';

type RecorderState = 'idle' | 'recording' | 'processing';

// Calibration: sample ambient noise for 1.5s before speech detection begins
const CALIBRATION_MS     = 1500;
const THRESHOLD_MARGIN_DB = 12;   // dB above noise floor to count as speech
const MIN_THRESHOLD_DB   = -50;   // never go below this (prevents false quiet-room triggers)
const MAX_THRESHOLD_DB   = -20;   // never go above this (prevents missing quiet speech)
const DEFAULT_THRESHOLD_DB = -35; // fallback if calibration collects no samples

const SILENCE_DURATION_MS = 1200;
const MIN_RECORDING_MS    = 400;  // ignore the first 400ms (mic startup noise)

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [state, setState] = useState<RecorderState>('idle');

  const onSilenceRef         = useRef<(() => void) | null>(null);
  const silenceFiredRef      = useRef(false);
  const speechDetectedRef    = useRef(false);
  const silenceStartRef      = useRef<number | null>(null);
  const recordingStartRef    = useRef<number>(0);

  // Adaptive threshold state
  const calibrationSamples   = useRef<number[]>([]);
  const dynamicThreshold     = useRef<number>(DEFAULT_THRESHOLD_DB);
  const calibrationDone      = useRef<boolean>(false);

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
      onSilenceRef.current       = onSilenceDetected ?? null;
      silenceFiredRef.current    = false;
      speechDetectedRef.current  = false;
      silenceStartRef.current    = null;
      recordingStartRef.current  = Date.now();
      calibrationSamples.current = [];
      dynamicThreshold.current   = DEFAULT_THRESHOLD_DB;
      calibrationDone.current    = false;

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

          // ── Calibration phase ────────────────────────────────────────────
          // Spend the first CALIBRATION_MS sampling the ambient noise floor.
          if (!calibrationDone.current) {
            if (elapsed < MIN_RECORDING_MS + CALIBRATION_MS) {
              if (db > -100) calibrationSamples.current.push(db); // ignore invalid readings
              return;
            }
            // Calibration window elapsed — compute dynamic threshold
            const samples = calibrationSamples.current;
            if (samples.length > 0) {
              samples.sort((a, b) => a - b);
              const p75 = samples[Math.floor(samples.length * 0.75)];
              dynamicThreshold.current = Math.max(
                MIN_THRESHOLD_DB,
                Math.min(MAX_THRESHOLD_DB, p75 + THRESHOLD_MARGIN_DB),
              );
            }
            calibrationDone.current = true;
          }

          // ── Speech detection using adaptive threshold ─────────────────────
          const threshold = dynamicThreshold.current;

          if (db >= threshold) {
            speechDetectedRef.current = true;
            silenceStartRef.current   = null;
          } else if (speechDetectedRef.current) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
              silenceFiredRef.current = true;
              onSilenceRef.current?.();
            }
          }
        },
        100
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
