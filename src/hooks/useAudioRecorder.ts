import { useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Alert, Linking } from 'react-native';

type RecorderState = 'idle' | 'recording' | 'processing';

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [state, setState] = useState<RecorderState>('idle');

  async function startRecording() {
    try {
      const { status, canAskAgain } = await Audio.requestPermissionsAsync();

      if (status !== 'granted') {
        if (!canAskAgain) {
          // User permanently denied — send them to settings
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

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState('recording');
    } catch (e) {
      setState('idle');
      throw e;
    }
  }

  async function stopRecording(): Promise<string | null> {
    const recording = recordingRef.current;
    if (!recording) return null;

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

  return { state, startRecording, stopRecording };
}
