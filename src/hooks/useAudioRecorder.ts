import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert, Linking } from 'react-native';

type RecorderState = 'idle' | 'recording' | 'processing';

// dB below which is considered silence (-35 works well for indoor speech)
const SILENCE_THRESHOLD_DB = -35;
// How long silence must last before we consider the utterance complete
const SILENCE_DURATION_MS = 1200;
// Ignore the first 600ms of every recording to avoid triggering on mic startup noise
const MIN_RECORDING_MS = 600;

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [state, setState] = useState<RecorderState>('idle');

  // Silence detection state — all in refs so the status callback always reads fresh values
  const silenceStartRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const onSilenceRef = useRef<(() => void) | null>(null);
  const silenceFiredRef = useRef(false); // prevent double-firing within one recording

  async function startRecording(onSilenceDetected?: () => void) {
    try {
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();

      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Microphone Permission Required',
            'Please enable microphone access for Talkative in your phone Settings → Apps → Talkative → Permissions → Microphone.',
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

      // Clean up any previous recording
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

      // Reset silence detection for this recording session
      onSilenceRef.current = onSilenceDetected ?? null;
      silenceStartRef.current = null;
      silenceFiredRef.current = false;
      recordingStartTimeRef.current = Date.now();

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

          const elapsed = Date.now() - recordingStartTimeRef.current;
          if (elapsed < MIN_RECORDING_MS) return;

          const db = status.metering ?? -160;

          if (db < SILENCE_THRESHOLD_DB) {
            // Sound level is below threshold — start or continue silence timer
            if (silenceStartRef.current === null) {
              silenceStartRef.current = Date.now();
            } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS) {
              // Silence held long enough — utterance is complete
              silenceFiredRef.current = true; // lock so it only fires once
              onSilenceRef.current?.();
            }
          } else {
            // Sound detected — reset silence timer
            silenceStartRef.current = null;
          }
        },
        100 // Check metering every 100ms
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

    // Disable the silence callback before stopping to prevent it firing during teardown
    onSilenceRef.current = null;
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

  // Stops and discards the current recording without returning the audio file.
  // Use when the user is about to speak and we don't want the mic picking it up.
  async function cancelRecording(): Promise<void> {
    const recording = recordingRef.current;
    if (!recording) return;
    onSilenceRef.current = null;
    silenceFiredRef.current = true;
    try { await recording.stopAndUnloadAsync(); } catch (_) {}
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) {}
    recordingRef.current = null;
    setState('idle');
  }

  return { state, startRecording, stopRecording, cancelRecording };
}
