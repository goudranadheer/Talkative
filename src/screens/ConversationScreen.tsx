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
import { translate } from '../services/translator';
import { translateWithReasoning, generateSuggestions } from '../services/reasoning';
import { transcribe } from '../services/stt';
import { speak, stopSpeech } from '../services/tts';
import { detectSpeaker } from '../services/speaker';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Conversation'>;
};

type ActiveSpeaker = 'me' | 'them';

export default function ConversationScreen({ navigation }: Props) {
  const { briefing, messages, addMessage, clearMessages, groqApiKey, deepseekApiKey, translationMode, ttsEnabled, setTtsEnabled } = useApp();
  const [inputText, setInputText] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker>('them');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const lastTTSEndTimeRef = useRef<number | null>(null);
  const listRef = useRef<FlatList>(null);
  const micActiveRef = useRef(false);
  const isProcessingRef = useRef(false);
  const processingQueueRef = useRef<string[]>([]);
  const lastSuggestionRef = useRef<string | null>(null);
  const lastSuggestionClearRef = useRef<NodeJS.Timeout | null>(null);

  const { state: recorderState, startRecording, stopRecording, cancelRecording, isVoiceActive } = useAudioRecorder();

  const myLang = briefing.myLanguage!;
  const theirLang = briefing.theirLanguage!;
  const micEnabled = groqApiKey.trim().length > 0;
  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || loading;

  // Auto-start mic when the conversation screen opens; stop it on unmount
  useEffect(() => {
    if (!micEnabled) return;
    startListening();
    return () => {
      if (lastSuggestionClearRef.current) clearTimeout(lastSuggestionClearRef.current);
      micActiveRef.current = false;
      cancelRecording(); // releases the expo-av recording object so a new one can be created
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

  useEffect(() => {
    if (!briefing.myLanguage || !briefing.theirLanguage) {
      navigation.replace('Briefing');
    }
  }, []);


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
      let translated: string;
      if (translationMode === 'reasoning') {
        translated = await translateWithReasoning({
          text,
          fromLanguage: fromLang.name,
          toLanguage: toLang.name,
          myLanguage: myLang.name,
          theirLanguage: theirLang.name,
          conversationContext: briefing.context,
          history: messages,
          groqApiKey,
          deepseekApiKey: deepseekApiKey || undefined,
        });
      } else {
        translated = await translate({
          text,
          fromLangCode: fromLang.value,
          toLangCode: toLang.value,
        });
      }

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
        generateSuggestions({
          history: newMessages,
          conversationContext: briefing.context,
          myLanguage: myLang.name,
          theirLanguage: theirLang.name,
          groqApiKey,
          deepseekApiKey: deepseekApiKey || undefined,
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
      setError(e?.message ?? 'Translation failed.');
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
      const { text, detectedLanguage } = await transcribe(uri, groqApiKey);
      if (!text) return;

      // Discard very short transcriptions — likely noise artefacts
      if (text.trim().split(/\s+/).length < 2) return;

      // Discard if detected language doesn't match either briefing language —
      // Whisper always guesses a language even for noise, so this filters random garbage
      const myLangCode    = myLang.value.toLowerCase().split('-')[0];
      const theirLangCode = theirLang.value.toLowerCase().split('-')[0];
      const detected      = detectedLanguage.toLowerCase().split('-')[0];
      if (detected !== myLangCode && detected !== theirLangCode) return;

      if (isSimilarToSuggestion(text)) {
        lastSuggestionRef.current = null;
        return;
      }

      const speaker = detectSpeaker(detected, { me: null, them: null }, myLangCode, lastTTSEndTimeRef.current);
      if (speaker === 'me') return;

      await handleTranslateText(text, 'them');
    } catch (e: any) {
      console.error('Hands-free error:', e);
      setError(e?.message ?? 'Transcription failed.');
      micActiveRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  async function startListening() {
    micActiveRef.current = true;
    stopSpeech();
    setSpeakingId(null);
    setError('');
    processingQueueRef.current = [];
    try {
      await startRecording(handleSilenceDetected);
    } catch (e: any) {
      micActiveRef.current = false;
      setError(e?.message ?? 'Failed to start microphone.');
    }
  }

  async function handleMicToggle() {
    if (isProcessing) return;

    if (isRecording) {
      micActiveRef.current = false;
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
          <Text style={styles.bubbleSpeaker}>
            {isMe ? `SAY THIS IN ${theirLang.name.toUpperCase()}` : `THEM (${theirLang.name})`}
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
            <Text style={styles.scriptHint}>THEY SAID THIS</Text>
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
            <Text style={styles.backText}>← Edit</Text>
          </TouchableOpacity>
          <Text style={styles.langPair}>{myLang.name} ↔ {theirLang.name}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => { setTtsEnabled(!ttsEnabled); stopSpeech(); setSpeakingId(null); }}
              style={styles.muteBtn}
            >
              <Text style={styles.muteIcon}>{ttsEnabled ? '🔊' : '🔇'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearMessages}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {briefing.context ? (
          <View style={styles.contextBadge}>
            <ScrollView style={{ maxHeight: 80 }}>
              <Text style={styles.contextText}>
                <Text style={{ fontWeight: '700', color: '#6c63ff' }}>CONTEXT: </Text>
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
                <Text style={styles.emptyText}>Conversation will appear here</Text>
                <Text style={styles.emptySubText}>
                  {micEnabled ? 'Listening automatically — just start talking' : 'Type what was said and tap send'}
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
                      <View style={styles.voiceDot} />
                      <View style={styles.voiceDot} />
                    </View>
                  ) : (
                    <ActivityIndicator size="small" color="#6c63ff" />
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
            <Text style={styles.suggestionsLabel}>REPLY WITH ({myLang.name}):</Text>
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
        {!micEnabled && (
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
          {micEnabled ? (
            <>
              <View style={styles.micHint}>
                {isProcessing ? (
                  <ActivityIndicator color="#6c63ff" />
                ) : isVoiceActive ? (
                  <View style={styles.listeningRow}>
                    <View style={styles.listeningDot} />
                    <Text style={styles.micHintText}>Speaking...</Text>
                  </View>
                ) : isRecording ? (
                  <View style={styles.listeningRow}>
                    <View style={[styles.listeningDot, styles.listeningDotIdle]} />
                    <Text style={styles.micHintText}>Listening...</Text>
                  </View>
                ) : (
                  <Text style={styles.micHintText}>Tap mic to start</Text>
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
              <TextInput
                style={styles.input}
                placeholder={`Type what ${activeSpeaker === 'them' ? theirLang.name : myLang.name} speaker said...`}
                placeholderTextColor="#555"
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
                  <ActivityIndicator color="#fff" size="small" />
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
  safe: { flex: 1, backgroundColor: '#0f0f1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e2e',
  },
  backBtn: { padding: 4 },
  backText: { color: '#6c63ff', fontSize: 15, fontWeight: '600' },
  langPair: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  muteBtn: { padding: 4 },
  muteIcon: { fontSize: 20 },
  clearText: { color: '#ff6b6b', fontSize: 14 },
  contextBadge: {
    backgroundColor: '#1a1a2e',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4a',
  },
  contextText: { color: '#888', fontSize: 12 },
  messageList: {
    padding: 16,
    paddingBottom: 200,
    flexGrow: 1,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: '#444', fontSize: 16, fontWeight: '600' },
  emptySubText: { color: '#333', fontSize: 13, marginTop: 6, textAlign: 'center' },
  bubble: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    maxWidth: '90%',
    borderWidth: 1,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: '#1a1a3e', borderColor: '#6c63ff44' },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: '#1e1e2e', borderColor: '#333' },
  previewBubble: { opacity: 0.6, minWidth: 60, alignItems: 'center' },
  voiceDots: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  voiceDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6c63ff' },
  bubbleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bubbleSpeaker: { fontSize: 11, color: '#666', fontWeight: '600', textTransform: 'uppercase' },
  replayBtn: { padding: 4 },
  replayIcon: { fontSize: 13, color: '#6c63ff' },
  bubbleOriginal: { color: '#aaa', fontSize: 13, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: '#2a2a3e', marginVertical: 8 },
  bubbleTranslated: { color: '#fff', fontSize: 18, fontWeight: '600' },
  scriptHint: { fontSize: 10, color: '#6c63ff', marginTop: 4, textTransform: 'uppercase', fontWeight: '700' },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginHorizontal: 16, marginBottom: 8 },
  speakerToggle: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  speakerBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  speakerBtnActive: { backgroundColor: '#6c63ff', borderColor: '#6c63ff' },
  speakerBtnText: { color: '#666', fontSize: 13, fontWeight: '600' },
  speakerBtnTextActive: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#6c63ff',
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#3a3a5c', opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  micHint: { flex: 1, alignItems: 'center' },
  micHintText: { color: '#555', fontSize: 14 },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e1e2e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6c63ff',
  },
  micBtnActive: { backgroundColor: '#6c63ff22', borderColor: '#6c63ff' },
  micBtnVoice: { backgroundColor: '#6c63ff44', borderColor: '#ff6b6b' },
  micBtnIcon: { fontSize: 28 },
  listeningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff6b6b' },
  listeningDotIdle: { backgroundColor: '#6c63ff' },
  suggestionsContainer: {
    paddingVertical: 12,
    backgroundColor: '#0a0a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  suggestionsLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 1,
  },
  suggestionsScroll: { paddingHorizontal: 16, gap: 8 },
  suggestionChip: {
    backgroundColor: '#1a1a3e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#6c63ff44',
  },
  suggestionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
});
