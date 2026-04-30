import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert, Linking } from 'react-native';

type RecorderState = 'idle' | 'recording' | 'processing';

const CALIBRATION_MS      = 1500;
const THRESHOLD_MARGIN_DB = 12;
const MIN_THRESHOLD_DB    = -50;
const MAX_THRESHOLD_DB    = -20;
const DEFAULT_THRESHOLD_DB = -35;

const SILENCE_DURATION_MS = 900;  // reduced from 1200ms for snappier detection
const MIN_RECORDING_MS    = 300;  // reduced from 400ms

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [state, setState] = useState<RecorderState>('idle');
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const onSilenceRef         = useRef<(() => void) | null>(null);
  const silenceFiredRef      = useRef(false);
  const speechDetectedRef    = useRef(false);
  const silenceStartRef      = useRef<number | null>(null);
  const recordingStartRef    = useRef<number>(0);

  const calibrationSamples   = useRef<number[]>([]);
  const dynamicThreshold     = useRef<number>(DEFAULT_THRESHOLD_DB);
  const calibrationDone      = useRef<boolean>(false);

  // Persists calibrated threshold across recording restarts so we don't
  // waste 1.9s recalibrating on every utterance (the root cause of merging).
  const savedThresholdRef    = useRef<number | null>(null);

  // Prevents setIsVoiceActive spam on every metering tick
  const voiceActiveRef       = useRef(false);

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

      onSilenceRef.current       = onSilenceDetected ?? null;
      silenceFiredRef.current    = false;
      speechDetectedRef.current  = false;
      silenceStartRef.current    = null;
      recordingStartRef.current  = Date.now();

      voiceActiveRef.current = false;
      setIsVoiceActive(false);

      // Reuse previously calibrated threshold — skips the 1.9s dead zone
      // that caused consecutive utterances to be merged.
      if (savedThresholdRef.current !== null) {
        dynamicThreshold.current  = savedThresholdRef.current;
        calibrationDone.current   = true;
        calibrationSamples.current = [];
      } else {
        calibrationSamples.current = [];
        dynamicThreshold.current   = DEFAULT_THRESHOLD_DB;
        calibrationDone.current    = false;
      }

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

          // ── Calibration phase (first recording only) ──────────────────────
          if (!calibrationDone.current) {
            if (elapsed < MIN_RECORDING_MS + CALIBRATION_MS) {
              if (db > -100) calibrationSamples.current.push(db);
              return;
            }
            const samples = calibrationSamples.current;
            if (samples.length > 0) {
              samples.sort((a, b) => a - b);
              const p75 = samples[Math.floor(samples.length * 0.75)];
              dynamicThreshold.current = Math.max(
                MIN_THRESHOLD_DB,
                Math.min(MAX_THRESHOLD_DB, p75 + THRESHOLD_MARGIN_DB),
              );
            }
            savedThresholdRef.current = dynamicThreshold.current;
            calibrationDone.current = true;
          }

          // ── Speech / silence detection ────────────────────────────────────
          const threshold = dynamicThreshold.current;
          const nowActive = db >= threshold;

          if (nowActive !== voiceActiveRef.current) {
            voiceActiveRef.current = nowActive;
            setIsVoiceActive(nowActive);
          }

          if (nowActive) {
            speechDetectedRef.current = true;
            silenceStartRef.current   = null;
          } else if (speechDetectedRef.current) {
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
              silenceFiredRef.current    = true;
              voiceActiveRef.current     = false;
              setIsVoiceActive(false);
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
    voiceActiveRef.current  = false;
    setIsVoiceActive(false);

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
    voiceActiveRef.current  = false;
    setIsVoiceActive(false);
    savedThresholdRef.current = null; // reset calibration on full session cancel
    try { await recording.stopAndUnloadAsync(); } catch (_) {}
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) {}
    recordingRef.current = null;
    setState('idle');
  }

  return { state, startRecording, stopRecording, cancelRecording, isVoiceActive };
}
