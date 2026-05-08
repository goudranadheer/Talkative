import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Animated, Easing, Modal, TextInput, FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useRealtimeSession } from '../hooks/useRealtimeSession';
import { transcribe } from '../services/stt';
import { loadProfile, saveProfile, UserProfile, Situation, SITUATION_LABELS, DEFAULT_PROFILE } from '../services/memoryService';
import { stopCurrentAudio } from '../utils/audioUtils';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Assistant'> };

type WhisperEntry = {
  id: string;
  type: 'translation' | 'guidance';
  german?: string;
  text: string;
  timestamp: number;
};

type AssistantState = 'idle' | 'voice_active' | 'processing' | 'speaking';

const MODE_COLORS = {
  guardian: '#ff6b6b',
  companion: '#6c63ff',
};

const ORB_COLORS: Record<AssistantState, string> = {
  idle: '#6c63ff',
  voice_active: '#ff6b6b',
  processing: '#ffd93d',
  speaking: '#6bcb77',
};

export default function AssistantScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [whisperLog, setWhisperLog] = useState<WhisperEntry[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsProfile, setSettingsProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [showSituationPicker, setShowSituationPicker] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);

  const micActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const lastTTSEndRef = useRef<number | null>(null);
  const liveTranscriptRef = useRef('');
  const logScrollRef = useRef<ScrollView>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  const { state: recorderState, startRecording, stopRecording, cancelRecording, isVoiceActive } = useAudioRecorder();

  const { status: sessionStatus, translate, speak, updateSession } = useRealtimeSession({
    profile,
    onTranscript: (delta) => {
      liveTranscriptRef.current += delta;
      setLiveTranscript(liveTranscriptRef.current);
    },
    onError: (msg) => setError(msg),
  });

  // Load profile on mount
  useEffect(() => {
    loadProfile().then(p => {
      setProfile(p);
      setSettingsProfile(p);
      setMicEnabled(!!p.groqApiKey.trim());
    });
  }, []);

  // Orb animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.8, duration: 1800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Auto-start mic when mic is enabled
  useEffect(() => {
    if (micEnabled && profile.groqApiKey) {
      startListening();
    }
    return () => {
      micActiveRef.current = false;
      cancelRecording();
    };
  }, [micEnabled, profile.groqApiKey]);

  // Sync state → assistantState for orb color
  useEffect(() => {
    if (sessionStatus === 'speaking') {
      setAssistantState('speaking');
    } else if (sessionStatus === 'translating') {
      setAssistantState('processing');
    } else if (isVoiceActive) {
      setAssistantState('voice_active');
    } else if (recorderState === 'processing') {
      setAssistantState('processing');
    } else {
      setAssistantState('idle');
    }
  }, [sessionStatus, isVoiceActive, recorderState]);

  function addWhisper(entry: Omit<WhisperEntry, 'id' | 'timestamp'>) {
    setWhisperLog(prev => [
      ...prev.slice(-19),
      { ...entry, id: Date.now().toString(), timestamp: Date.now() },
    ]);
    setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function handleSilenceDetected() {
    if (!micActiveRef.current) return;

    const uri = await stopRecording();

    if (micActiveRef.current) {
      await startRecording(handleSilenceDetected);
    }

    if (uri) {
      queueRef.current.push(uri);
      if (!isProcessingRef.current) drainQueue();
    }
  }

  async function drainQueue() {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const uri = queueRef.current.shift()!;
        await processAudio(uri);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }

  async function processAudio(uri: string) {
    if (!profile.groqApiKey) return;
    setError('');
    try {
      const { text, detectedLanguage } = await transcribe(uri, profile.groqApiKey);
      if (!text || text.trim().split(/\s+/).length < 2) return;

      const detected = detectedLanguage.toLowerCase().split('-')[0];
      const myLang = profile.nativeLanguage.toLowerCase().split('-')[0];

      // Skip if it's the user's own language (they're speaking, not listening)
      if (detected === myLang) return;

      // Skip non-German, non-user-language (noise artifacts)
      if (detected !== 'de' && detected !== myLang) return;

      // Skip if TTS just finished (might be echo)
      if (lastTTSEndRef.current && Date.now() - lastTTSEndRef.current < 800) return;

      liveTranscriptRef.current = '';
      setLiveTranscript('');

      await translateAndSpeak(text);
    } catch (e: any) {
      setError(e?.message ?? 'Transcription failed');
    }
  }

  async function translateAndSpeak(germanText: string) {
    if (sessionStatus === 'disconnected' || sessionStatus === 'error') {
      setError('Assistant not connected. Check your OpenAI API key.');
      return;
    }
    try {
      await translate(germanText);
      lastTTSEndRef.current = Date.now();

      addWhisper({
        type: 'translation',
        german: germanText,
        text: liveTranscriptRef.current || '(translation spoken)',
      });

      liveTranscriptRef.current = '';
      setLiveTranscript('');
    } catch (e: any) {
      setError(e?.message ?? 'Translation failed');
    }
  }

  async function startListening() {
    micActiveRef.current = true;
    await stopCurrentAudio();
    setError('');
    queueRef.current = [];
    try {
      await startRecording(handleSilenceDetected);
    } catch (e: any) {
      micActiveRef.current = false;
      setError(e?.message ?? 'Microphone failed');
    }
  }

  async function handleMicToggle() {
    if (recorderState === 'recording') {
      micActiveRef.current = false;
      queueRef.current = [];
      await cancelRecording();
      setMicEnabled(false);
    } else {
      setMicEnabled(true);
      await startListening();
    }
  }

  async function handleSpeakGuidance(text: string) {
    if (sessionStatus !== 'ready') return;
    try {
      await speak(text);
      addWhisper({ type: 'guidance', text });
    } catch (_) {}
  }

  async function handleSaveSettings() {
    await saveProfile(settingsProfile);
    setProfile(settingsProfile);
    setMicEnabled(!!settingsProfile.groqApiKey.trim());
    updateSession(settingsProfile);
    setShowSettings(false);
  }

  const isRecording = recorderState === 'recording';
  const mode = ['government_office', 'medical', 'pharmacy', 'bank'].includes(profile.currentSituation)
    ? 'guardian'
    : 'companion';
  const orbColor = ORB_COLORS[assistantState];

  const STATUS_TEXT: Record<AssistantState, string> = {
    idle: isRecording ? 'Listening...' : 'Tap mic to start',
    voice_active: 'German detected...',
    processing: 'Translating...',
    speaking: 'Speaking...',
  };

  const situations = Object.entries(SITUATION_LABELS) as [Situation, string][];

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.modeBadge, { backgroundColor: MODE_COLORS[mode] + '22', borderColor: MODE_COLORS[mode] + '55' }]}>
          <Text style={[s.modeText, { color: MODE_COLORS[mode] }]}>{mode.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSituationPicker(true)} style={s.locationBtn}>
          <Text style={s.locationText}>{SITUATION_LABELS[profile.currentSituation]}</Text>
          <Text style={s.locationArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSettingsProfile(profile); setShowSettings(true); }} style={s.settingsBtn}>
          <Text style={s.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Connection status */}
      {sessionStatus === 'disconnected' || sessionStatus === 'error' ? (
        <View style={s.warningBanner}>
          <Text style={s.warningText}>
            {sessionStatus === 'error' ? '⚠ Connection error' : '⏳ Connecting to assistant...'}
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Orb */}
      <View style={s.orbContainer}>
        <Animated.View
          style={[
            s.orbGlow,
            {
              backgroundColor: orbColor,
              opacity: glowAnim,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />
        <Animated.View
          style={[s.orb, { backgroundColor: orbColor, transform: [{ scale: pulseAnim }] }]}
        >
          <Text style={s.orbIcon}>
            {assistantState === 'idle' ? '◉' :
             assistantState === 'voice_active' ? '◎' :
             assistantState === 'processing' ? '◌' : '◈'}
          </Text>
        </Animated.View>
        <Text style={s.statusText}>{STATUS_TEXT[assistantState]}</Text>
      </View>

      {/* Live transcript (what's being translated) */}
      {liveTranscript.length > 0 && (
        <View style={s.liveCard}>
          <Text style={s.liveLabel}>TRANSLATING</Text>
          <Text style={s.liveText}>{liveTranscript}</Text>
        </View>
      )}

      {/* Whisper log */}
      <ScrollView
        ref={logScrollRef}
        style={s.log}
        contentContainerStyle={s.logContent}
        showsVerticalScrollIndicator={false}
      >
        {whisperLog.length === 0 ? (
          <View style={s.emptyLog}>
            <Text style={s.emptyLogText}>Assistant whispers will appear here</Text>
            <Text style={s.emptyLogSub}>
              {micEnabled
                ? 'Listening — speak German around me and I\'ll translate'
                : 'Tap the mic button to start listening'}
            </Text>
          </View>
        ) : (
          whisperLog.map(entry => (
            <View
              key={entry.id}
              style={[s.whisperCard, entry.type === 'guidance' && s.whisperCardGuidance]}
            >
              {entry.type === 'translation' && entry.german ? (
                <>
                  <Text style={s.whisperGerman}>{entry.german}</Text>
                  <View style={s.whisperDivider} />
                </>
              ) : (
                <Text style={s.whisperTypeLabel}>💡 GUIDANCE</Text>
              )}
              <Text style={s.whisperText}>{entry.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Bottom controls */}
      <View style={s.controls}>
        <TouchableOpacity
          style={[s.micBtn, isRecording && s.micBtnActive, isVoiceActive && s.micBtnVoice]}
          onPress={handleMicToggle}
          disabled={!profile.groqApiKey || assistantState === 'processing'}
        >
          <Text style={s.micIcon}>{isRecording ? '⏸' : '🎙'}</Text>
        </TouchableOpacity>

        {!profile.groqApiKey && (
          <Text style={s.noMicText}>Add Groq key in settings to enable mic</Text>
        )}
      </View>

      {/* Situation picker */}
      <Modal visible={showSituationPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Current situation</Text>
            <Text style={s.modalSub}>Tell me where you are — I'll adjust my guidance</Text>
            <FlatList
              data={situations}
              keyExtractor={([key]) => key}
              renderItem={({ item: [key, label] }) => (
                <TouchableOpacity
                  style={[s.situationItem, profile.currentSituation === key && s.situationItemActive]}
                  onPress={async () => {
                    const updated = await saveProfile({ ...profile, currentSituation: key as Situation }) as any;
                    const newProfile = { ...profile, currentSituation: key as Situation };
                    setProfile(newProfile);
                    updateSession(newProfile);
                    setShowSituationPicker(false);

                    // Give proactive briefing for high-stakes situations
                    const highStakes = ['government_office', 'medical', 'pharmacy', 'bank'];
                    if (highStakes.includes(key)) {
                      const briefings: Record<string, string> = {
                        government_office: "You're now in Guardian mode for a government office. I'll guide you through every step. Have your passport and documents ready.",
                        medical: "Guardian mode active. I'll translate everything precisely. If asked about medications, say the name clearly.",
                        pharmacy: "Pharmacy mode active. I'll help you explain symptoms and understand medication instructions.",
                        bank: "Banking mode active. I'll translate all financial terms clearly.",
                      };
                      await handleSpeakGuidance(briefings[key] ?? '');
                    }
                  }}
                >
                  <Text style={[s.situationText, profile.currentSituation === key && s.situationTextActive]}>
                    {label}
                  </Text>
                  {profile.currentSituation === key && <Text style={s.situationCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSituationPicker(false)}>
              <Text style={s.cancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Settings modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { maxHeight: '85%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>Settings</Text>

              <Text style={s.settingsLabel}>OpenAI API Key</Text>
              <TextInput
                style={s.settingsInput}
                value={settingsProfile.openAiKey}
                onChangeText={v => setSettingsProfile(p => ({ ...p, openAiKey: v }))}
                placeholder="sk-..."
                placeholderTextColor="#444"
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={s.settingsLabel}>Groq API Key (mic / STT)</Text>
              <TextInput
                style={s.settingsInput}
                value={settingsProfile.groqApiKey}
                onChangeText={v => setSettingsProfile(p => ({ ...p, groqApiKey: v }))}
                placeholder="gsk_..."
                placeholderTextColor="#444"
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={s.settingsLabel}>Your name</Text>
              <TextInput
                style={s.settingsInput}
                value={settingsProfile.name}
                onChangeText={v => setSettingsProfile(p => ({ ...p, name: v }))}
                placeholder="Optional"
                placeholderTextColor="#444"
              />

              <Text style={s.settingsLabel}>City in Germany</Text>
              <TextInput
                style={s.settingsInput}
                value={settingsProfile.city}
                onChangeText={v => setSettingsProfile(p => ({ ...p, city: v }))}
                placeholder="e.g. Munich"
                placeholderTextColor="#444"
              />

              <Text style={s.settingsLabel}>Custom context</Text>
              <TextInput
                style={[s.settingsInput, { height: 80, textAlignVertical: 'top' }]}
                value={settingsProfile.customContext}
                onChangeText={v => setSettingsProfile(p => ({ ...p, customContext: v }))}
                placeholder="e.g. I'm a Computer Science student at TU Munich. I have a residence permit appointment."
                placeholderTextColor="#444"
                multiline
              />

              <TouchableOpacity style={s.saveBtn} onPress={handleSaveSettings}>
                <Text style={s.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowSettings(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a14' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  modeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  locationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  locationText: { fontSize: 13, color: '#666', fontWeight: '500' },
  locationArrow: { color: '#444', fontSize: 18 },
  settingsBtn: { padding: 4 },
  settingsIcon: { fontSize: 20, color: '#555' },

  warningBanner: {
    backgroundColor: '#1a1a00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333300',
  },
  warningText: { color: '#888800', fontSize: 12, textAlign: 'center' },
  errorBanner: {
    backgroundColor: '#1a0000',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: { color: '#ff6b6b', fontSize: 12, textAlign: 'center' },

  orbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  orbGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.3,
  },
  orb: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 20,
  },
  orbIcon: { fontSize: 48, color: 'rgba(255,255,255,0.8)' },
  statusText: { marginTop: 16, color: '#555', fontSize: 14, fontWeight: '500' },

  liveCard: {
    marginHorizontal: 16,
    backgroundColor: '#0f0f20',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffd93d33',
    marginBottom: 8,
  },
  liveLabel: { fontSize: 10, color: '#ffd93d', fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  liveText: { color: '#fff', fontSize: 15 },

  log: { flex: 1, marginHorizontal: 16 },
  logContent: { paddingBottom: 16, gap: 10 },
  emptyLog: { alignItems: 'center', paddingTop: 40 },
  emptyLogText: { color: '#333', fontSize: 15, fontWeight: '600' },
  emptyLogSub: { color: '#2a2a2a', fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 },

  whisperCard: {
    backgroundColor: '#111122',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#6c63ff22',
  },
  whisperCardGuidance: {
    backgroundColor: '#0f1a0f',
    borderColor: '#6bcb7733',
  },
  whisperGerman: { color: '#555', fontSize: 13, fontStyle: 'italic' },
  whisperDivider: { height: 1, backgroundColor: '#1e1e30', marginVertical: 8 },
  whisperTypeLabel: { fontSize: 10, color: '#6bcb77', fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  whisperText: { color: '#e0e0ff', fontSize: 16, fontWeight: '500', lineHeight: 24 },

  controls: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: 32,
    gap: 10,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#131320',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6c63ff',
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  micBtnActive: { backgroundColor: '#1a1a3e', borderColor: '#6c63ff' },
  micBtnVoice: { backgroundColor: '#3a0a0a', borderColor: '#ff6b6b' },
  micIcon: { fontSize: 32 },
  noMicText: { color: '#333', fontSize: 11, textAlign: 'center', paddingHorizontal: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#111120',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  modalSub: { fontSize: 13, color: '#555', marginBottom: 16 },

  situationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2a',
  },
  situationItemActive: { backgroundColor: '#6c63ff11', marginHorizontal: -20, paddingHorizontal: 20 },
  situationText: { fontSize: 15, color: '#bbb' },
  situationTextActive: { color: '#fff', fontWeight: '600' },
  situationCheck: { color: '#6c63ff', fontSize: 16, fontWeight: '700' },

  cancelBtn: { alignItems: 'center', padding: 14, marginTop: 8 },
  cancelText: { color: '#6c63ff', fontSize: 16, fontWeight: '600' },

  settingsLabel: { fontSize: 12, color: '#666', fontWeight: '600', marginTop: 16, marginBottom: 6, letterSpacing: 0.5 },
  settingsInput: {
    backgroundColor: '#1a1a2a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  saveBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
