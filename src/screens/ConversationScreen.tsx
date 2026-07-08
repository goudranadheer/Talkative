import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useApp, Message } from '../context/AppContext';
import { transcribeAudio, aiTranslate, aiSuggest, ApiError } from '../services/api';
import { speak, stopSpeech } from '../services/tts';
import { detectSpeaker } from '../services/speaker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { colors, hudLabel, radii, glow } from '../constants/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Conversation'>;
};

type ActiveSpeaker = 'me' | 'them';

export default function ConversationScreen({ navigation }: Props) {
  const { briefing, messages, addMessage, clearMessages, ttsEnabled, setTtsEnabled, refreshProfile } = useApp();
  const [inputText, setInputText] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker>('them');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true); // hands-free by default; off = typed input

  const lastTTSEndTimeRef = useRef<number | null>(null);
  const listRef = useRef<FlatList>(null);
  const micActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  const processingQueueRef = useRef<string[]>([]); // URIs waiting to be transcribed
  const lastSuggestionRef = useRef<string | null>(null);
  const lastSuggestionClearRef = useRef<NodeJS.Timeout | null>(null);

  const { state: recorderState, startRecording, stopRecording, cancelRecording, isVoiceActive } = useAudioRecorder();

  const myLang = briefing.myLanguage!;
  const theirLang = briefing.theirLanguage!;
  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || loading;

  // Auto-start mic when the conversation screen opens; stop it on unmount
  useEffect(() => {
    startListening();
    return () => {
      micActiveRef.current = false;
      cancelRecording(); // releases the expo-av recording object so a new one can be created
      refreshProfile().catch(() => {});
    };
  }, []);

  function isSimilarToSuggestion(transcribed: string): boolean {
    const stored = lastSuggestionRef.current;
    if (!stored) return false;
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean);
    const tWords = normalize(transcribed);
    const sWords = new Set(normalize(stored));
    if (tWords.length === 0) return false;
    const matches = tWords.filter(w => sWords.has(w)).length;
    return matches / tWords.length >= 0.5;
  }

  // Quota exhaustion is terminal for the session — stop the mic so we don't
  // keep queueing utterances that can only fail.
  async function handleQuotaExhausted(message: string) {
    setError(message);
    micActiveRef.current = false;
    setMicOn(false);
    processingQueueRef.current = [];
    await cancelRecording();
  }

  async function speakTranslation(msg: Message) {
    const targetLang = msg.speaker === 'them' ? myLang : theirLang;
    setSpeakingId(msg.id);
    try {
      await speak(msg.translated, targetLang.value);
      lastTTSEndTimeRef.current = Date.now();
    } finally {
      setSpeakingId(null);
    }
  }

  async function handleTranslateText(text: string, speaker: ActiveSpeaker) {
    setError('');
    setLoading(true);

    const fromLang = speaker === 'them' ? theirLang : myLang;
    const toLang   = speaker === 'them' ? myLang : theirLang;

    try {
      const translated = await aiTranslate({
        text,
        fromLanguage: fromLang.name,
        toLanguage: toLang.name,
        myLanguage: myLang.name,
        theirLanguage: theirLang.name,
        conversationContext: briefing.context,
        history: messages,
      });

      const msg: Message = {
        id: Date.now().toString(),
        speaker,
        original: text,
        translated,
        timestamp: new Date(),
      };

      addMessage(msg);
      const newMessages = [...messages, msg];

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

      if (speaker === 'them') {
        // Fire suggestions in parallel with TTS — don't block
        aiSuggest({
          history: newMessages,
          conversationContext: briefing.context,
          myLanguage: myLang.name,
          theirLanguage: theirLang.name,
        }).then(sugs => setSuggestions(sugs)).catch(() => {});

        if (ttsEnabled) {
          await speak(msg.translated, myLang.value);
          lastTTSEndTimeRef.current = Date.now();
        }
      } else {
        // User sent a message — clear suggestions and store translation for similarity check
        setSuggestions([]);
        if (lastSuggestionClearRef.current) clearTimeout(lastSuggestionClearRef.current);
        lastSuggestionRef.current = msg.translated;
        lastSuggestionClearRef.current = setTimeout(() => {
          lastSuggestionRef.current = null;
        }, 15000);

        if (ttsEnabled) {
          await speak(msg.translated, theirLang.value);
          lastTTSEndTimeRef.current = Date.now();
        }
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.code === 'quota_exhausted') {
        await handleQuotaExhausted(e.message);
      } else {
        setError(e?.message ?? 'Translation failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSuggestionPress(suggestion: string) {
    if (isProcessing) return;
    setInputText('');
    await handleTranslateText(suggestion, 'me');
  }

  async function handleSendText() {
    const text = inputText.trim();
    if (!text || isProcessing) return;
    setInputText('');
    await handleTranslateText(text, activeSpeaker);
  }

  // Called by VAD when silence is detected. Stops the current recording,
  // restarts it immediately (so the next utterance is never missed), then
  // queues the audio URI for serial processing.
  async function handleSilenceDetected() {
    if (!micActiveRef.current) return;

    const uri = await stopRecording();

    if (micActiveRef.current) {
      await startRecording(handleSilenceDetected);
    }

    if (uri) {
      processingQueueRef.current.push(uri);
      if (!isProcessingRef.current) drainProcessingQueue();
    }
  }

  // Drains queued URIs one at a time. Concurrent calls are no-ops.
  async function drainProcessingQueue() {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      while (processingQueueRef.current.length > 0) {
        const uri = processingQueueRef.current.shift()!;
        await processUri(uri);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }

  async function processUri(uri: string) {
    setLoading(true);
    try {
      const { text, detectedLanguage } = await transcribeAudio(uri);
      if (!text) return;

      if (isSimilarToSuggestion(text)) {
        lastSuggestionRef.current = null;
        return;
      }

      const myLangCode = myLang.value.toLowerCase().split('-')[0];
      const detected   = detectedLanguage.toLowerCase().split('-')[0];
      const speaker    = detectSpeaker(detected, { me: null, them: null }, myLangCode, lastTTSEndTimeRef.current);

      if (speaker === 'me') return;

      await handleTranslateText(text, 'them');
    } catch (e: any) {
      console.error('Hands-free error:', e);
      if (e instanceof ApiError && e.code === 'quota_exhausted') {
        await handleQuotaExhausted(e.message);
      } else {
        setError(e?.message ?? 'Transcription failed.');
        micActiveRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  }

  async function startListening() {
    micActiveRef.current = true;
    setMicOn(true);
    stopSpeech();
    setSpeakingId(null);
    setError('');
    processingQueueRef.current = [];
    try {
      await startRecording(handleSilenceDetected);
    } catch (e: any) {
      micActiveRef.current = false;
      setMicOn(false);
      setError(e?.message ?? 'Failed to start microphone.');
    }
  }

  async function handleMicToggle() {
    if (isProcessing) return;

    if (isRecording) {
      micActiveRef.current = false;
      setMicOn(false);
      processingQueueRef.current = [];
      await cancelRecording();
    } else {
      await startListening();
    }
  }

  async function handleReplay(msg: Message) {
    if (speakingId) {
      stopSpeech();
      setSpeakingId(null);
      return;
    }
    await speakTranslation(msg);
  }

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.speaker === 'me';
    const isSpeaking = speakingId === item.id;

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <View style={styles.bubbleHeader}>
          <Text style={[styles.bubbleSpeaker, isMe && styles.bubbleSpeakerMe]}>
            {isMe ? `SAY THIS IN ${theirLang.name.toUpperCase()}` : `THEM · ${theirLang.name.toUpperCase()}`}
          </Text>
          <TouchableOpacity onPress={() => handleReplay(item)} style={styles.replayBtn}>
            <Text style={styles.replayIcon}>{isSpeaking ? '⏹' : '▶'}</Text>
          </TouchableOpacity>
        </View>

        {isMe ? (
          <Text style={styles.bubbleTranslated}>{item.translated}</Text>
        ) : (
          <>
            <Text style={styles.bubbleOriginal}>{item.original}</Text>
            <View style={styles.divider} />
            <Text style={styles.bubbleTranslated}>{item.translated}</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← SETUP</Text>
          </TouchableOpacity>
          <View style={styles.langPairWrap}>
            <Text style={styles.langPair}>{myLang.name}</Text>
            <Text style={styles.langPairArrow}> ⇌ </Text>
            <Text style={styles.langPair}>{theirLang.name}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => { setTtsEnabled(!ttsEnabled); stopSpeech(); setSpeakingId(null); }}
              style={styles.muteBtn}
            >
              <Text style={styles.muteIcon}>{ttsEnabled ? '🔊' : '🔇'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearMessages}>
              <Text style={styles.clearText}>CLEAR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {briefing.context ? (
          <View style={styles.contextBadge}>
            <ScrollView style={{ maxHeight: 80 }}>
              <Text style={styles.contextText}>
                <Text style={{ fontWeight: '700', color: colors.primary }}>MISSION: </Text>
                {briefing.context}
              </Text>
            </ScrollView>
          </View>
        ) : null}

        {/* Messages */}
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyOrb}>◉</Text>
                <Text style={styles.emptyText}>CHANNEL OPEN</Text>
                <Text style={styles.emptySubText}>
                  {micOn ? 'Listening automatically — just start talking' : 'Type what was said and tap send'}
                </Text>
              </View>
            }
            ListFooterComponent={
              // Live voice indicator at the bottom of the message list
              isRecording && (isVoiceActive || isProcessing) ? (
                <View style={[styles.bubble, styles.bubbleThem, styles.previewBubble]}>
                  {isVoiceActive ? (
                    <View style={styles.voiceDots}>
                      <View style={styles.voiceDot} />
                      <View style={[styles.voiceDot, { opacity: 0.7 }]} />
                      <View style={[styles.voiceDot, { opacity: 0.4 }]} />
                    </View>
                  ) : (
                    <ActivityIndicator size="small" color={colors.primary} />
                  )}
                </View>
              ) : null
            }
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsLabel}>REPLY WITH · {myLang.name.toUpperCase()}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {suggestions.map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestionPress(s)}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Speaker toggle — text mode only */}
        {!micOn && (
          <View style={styles.speakerToggle}>
            <TouchableOpacity
              style={[styles.speakerBtn, activeSpeaker === 'them' && styles.speakerBtnActive]}
              onPress={() => setActiveSpeaker('them')}
            >
              <Text style={[styles.speakerBtnText, activeSpeaker === 'them' && styles.speakerBtnTextActive]}>
                {theirLang.name} speaking
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.speakerBtn, activeSpeaker === 'me' && styles.speakerBtnActive]}
              onPress={() => setActiveSpeaker('me')}
            >
              <Text style={[styles.speakerBtnText, activeSpeaker === 'me' && styles.speakerBtnTextActive]}>
                {myLang.name} speaking
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input row */}
        <View style={styles.inputRow}>
          {micOn ? (
            <>
              <View style={styles.micHint}>
                {isProcessing ? (
                  <ActivityIndicator color={colors.primary} />
                ) : isVoiceActive ? (
                  <View style={styles.listeningRow}>
                    <View style={styles.listeningDot} />
                    <Text style={[styles.micHintText, { color: colors.primary }]}>VOICE DETECTED</Text>
                  </View>
                ) : isRecording ? (
                  <View style={styles.listeningRow}>
                    <View style={[styles.listeningDot, styles.listeningDotIdle]} />
                    <Text style={styles.micHintText}>LISTENING…</Text>
                  </View>
                ) : (
                  <Text style={styles.micHintText}>TAP MIC TO START</Text>
                )}
              </View>
              <Pressable
                style={[styles.micBtn, isRecording && styles.micBtnActive, isVoiceActive && styles.micBtnVoice]}
                onPress={handleMicToggle}
                disabled={isProcessing}
              >
                <Text style={styles.micBtnIcon}>{isRecording ? '⏸' : '🎙'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.micSmallBtn} onPress={handleMicToggle}>
                <Text style={{ fontSize: 18 }}>🎙</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder={`Type what ${activeSpeaker === 'them' ? theirLang.name : myLang.name} speaker said...`}
                placeholderTextColor={colors.textFaint}
                value={inputText}
                onChangeText={setInputText}
                multiline
                onSubmitEditing={handleSendText}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!inputText.trim() || isProcessing) && styles.sendBtnDisabled]}
                onPress={handleSendText}
                disabled={!inputText.trim() || isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.bg} size="small" />
                ) : (
                  <Text style={styles.sendBtnText}>↑</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  backBtn: { padding: 4 },
  backText: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  langPairWrap: { flexDirection: 'row', alignItems: 'center' },
  langPair: { color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  langPairArrow: { color: colors.primary, fontSize: 15 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muteBtn: { padding: 4 },
  muteIcon: { fontSize: 18 },
  clearText: { color: colors.danger, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  contextBadge: {
    backgroundColor: colors.surface,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  contextText: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  messageList: {
    padding: 16,
    paddingBottom: 200,
    flexGrow: 1,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyOrb: {
    fontSize: 34,
    color: colors.primary,
    marginBottom: 14,
    textShadowColor: colors.borderGlow,
    textShadowRadius: 16,
  },
  emptyText: { color: colors.textDim, fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  emptySubText: { color: colors.textFaint, fontSize: 13, marginTop: 8, textAlign: 'center' },
  bubble: {
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12,
    maxWidth: '90%',
    borderWidth: 1,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
    ...glow,
    shadowColor: '#7C4DFF',
    shadowOpacity: 0.18,
  },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border },
  previewBubble: { opacity: 0.7, minWidth: 60, alignItems: 'center' },
  voiceDots: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  voiceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bubbleSpeaker: { fontSize: 10, color: colors.textFaint, fontWeight: '800', letterSpacing: 1.2 },
  bubbleSpeakerMe: { color: colors.accent },
  replayBtn: { padding: 4 },
  replayIcon: { fontSize: 13, color: colors.primary },
  bubbleOriginal: { color: colors.textDim, fontSize: 13, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  bubbleTranslated: { color: colors.text, fontSize: 18, fontWeight: '600', lineHeight: 25 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginHorizontal: 16, marginBottom: 8 },
  speakerToggle: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  speakerBtn: {
    flex: 1,
    padding: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakerBtnActive: { backgroundColor: colors.surfaceHi, borderColor: colors.primary },
  speakerBtnText: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
  speakerBtnTextActive: { color: colors.primary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 10,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow,
    shadowOpacity: 0.35,
  },
  sendBtnDisabled: { backgroundColor: colors.surfaceHi, shadowOpacity: 0, elevation: 0 },
  sendBtnText: { color: '#03121A', fontSize: 22, fontWeight: '800' },
  micSmallBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micHint: { flex: 1, alignItems: 'center' },
  micHintText: { ...hudLabel, fontSize: 11 },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    ...glow,
    shadowOpacity: 0.3,
  },
  micBtnActive: { backgroundColor: colors.primaryDim },
  micBtnVoice: { backgroundColor: colors.primaryDim, borderColor: colors.danger, shadowColor: '#FF5C7A' },
  micBtnIcon: { fontSize: 26 },
  listeningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  listeningDotIdle: { backgroundColor: colors.primary },
  suggestionsContainer: {
    paddingVertical: 12,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionsLabel: {
    ...hudLabel,
    fontSize: 10,
    color: colors.primary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  suggestionsScroll: { paddingHorizontal: 16, gap: 8 },
  suggestionChip: {
    backgroundColor: colors.accentDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  suggestionText: { color: colors.text, fontSize: 14, fontWeight: '500' },
});
