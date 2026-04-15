import React, { useState, useRef } from 'react';
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
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Conversation'>;
};

type ActiveSpeaker = 'me' | 'them';

export default function ConversationScreen({ navigation }: Props) {
  const { briefing, messages, addMessage, clearMessages, groqApiKey, translationMode, ttsEnabled, setTtsEnabled } = useApp();
  const [inputText, setInputText] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker>('them');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [lastDetectedSpeaker, setLastDetectedSpeaker] = useState<ActiveSpeaker | null>(null);
  const listRef = useRef<FlatList>(null);
  const { state: recorderState, startRecording, stopRecording } = useAudioRecorder();

  const myLang = briefing.myLanguage!;
  const theirLang = briefing.theirLanguage!;
  const micEnabled = groqApiKey.trim().length > 0;
  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || loading;

  async function updateSuggestions(currentMessages: Message[], lastSpeaker: ActiveSpeaker) {
    try {
      const sugs = await generateSuggestions({
        history: currentMessages,
        conversationContext: briefing.context,
        myLanguage: myLang.name,
        theirLanguage: theirLang.name,
        lastSpeaker,
        groqApiKey,
      });
      setSuggestions(sugs);
    } catch (e) {
      console.error('Failed to update suggestions:', e);
    }
  }

  async function speakTranslation(msg: Message) {
    const targetLang = msg.speaker === 'them' ? myLang : theirLang;
    setSpeakingId(msg.id);
    try {
      await speak(msg.translated, targetLang.value);
    } finally {
      setSpeakingId(null);
    }
  }

  async function handleTranslateText(text: string, speaker: ActiveSpeaker) {
    setError('');
    setLoading(true);

    const fromLang = speaker === 'them' ? theirLang : myLang;
    const toLang = speaker === 'them' ? myLang : theirLang;

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

      // Update suggestions based on who just spoke
      updateSuggestions(newMessages, speaker);

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

      // AUDIO LOGIC FOR THE DIRECTOR (YOU)
      if (ttsEnabled) {
        if (speaker === 'them') {
          // They spoke: Speak the ENGLISH translation into your earpiece
          await speak(msg.translated, myLang.value);
        } else {
          // You selected a suggestion: Speak the HINDI/TELUGU translation into your earpiece
          // so you know how to say it out loud to them.
          await speak(msg.translated, theirLang.value);
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

  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVADActiveRef = useRef(false);

  async function handleMicToggle() {
    if (isProcessing) return;

    if (isRecording) {
      // STOP RECORDING
      isVADActiveRef.current = false;
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      await processRecording();
    } else {
      // START RECORDING
      stopSpeech();
      setSpeakingId(null);
      setError('');
      try {
        await startRecording();
        isVADActiveRef.current = true;
        startHandsFreeLoop();
      } catch (e: any) {
        setError(e?.message ?? JSON.stringify(e) ?? 'Failed to start microphone.');
      }
    }
  }

  function startHandsFreeLoop() {
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    vadIntervalRef.current = setInterval(async () => {
      if (isVADActiveRef.current) {
        await processRecording(true);
      }
    }, 5000); // 5 second chunks — responsive enough for natural speech
  }

  async function processRecording(autoRestart = false) {
    try {
      const uri = await stopRecording();
      if (!uri) {
        if (autoRestart && isVADActiveRef.current) await startRecording();
        return;
      }

      setLoading(true);
      // Restart immediately to minimise gaps — new chunk captures next utterance
      // while we transcribe the previous one
      if (autoRestart && isVADActiveRef.current) await startRecording();

      const { text, detectedLanguage } = await transcribe(uri, groqApiKey);
      if (!text) {
        setLoading(false);
        return;
      }

      const isMyLang = detectedLanguage.toLowerCase().startsWith(myLang.value.toLowerCase().split('-')[0]);
      const speaker: ActiveSpeaker = isMyLang ? 'me' : 'them';
      setLastDetectedSpeaker(speaker);

      await handleTranslateText(text, speaker);
    } catch (e: any) {
      console.error('Hands-free error:', e);
      setError(e?.message ?? 'Transcription failed.');
      // Stop the loop on error so it doesn't keep retrying endlessly
      isVADActiveRef.current = false;
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    } finally {
      setLoading(false);
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
            {isMe ? `YOU (${myLang.name})` : `THEM (${theirLang.name})`}
          </Text>
          <TouchableOpacity onPress={() => handleReplay(item)} style={styles.replayBtn}>
            <Text style={styles.replayIcon}>{isSpeaking ? '⏹' : '▶'}</Text>
          </TouchableOpacity>
        </View>

        {/* Original Speech (smaller/subtle) */}
        <Text style={styles.bubbleOriginal}>{item.original}</Text>

        <View style={styles.divider} />

        {/* Translation (Large & Clear for reading) */}
        <Text style={styles.bubbleTranslated}>
          {item.translated}
        </Text>

        <Text style={styles.scriptHint}>
          {isMe ? `READ THIS OUT LOUD` : `THEY SAID THIS`}
        </Text>
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
                  {micEnabled ? 'Tap the mic to start listening' : 'Type what was said and tap send'}
                </Text>
              </View>
            }
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Suggestions Section — always visible when suggestions exist */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsLabel}>
              {lastDetectedSpeaker === 'them'
                ? `YOU SHOULD SAY (${myLang.name}):`
                : lastDetectedSpeaker === 'me'
                ? `THEY MIGHT SAY (${theirLang.name}):`
                : 'SUGGESTED REPLIES:'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {suggestions.map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.suggestionChip, lastDetectedSpeaker === 'me' && styles.suggestionChipPrediction]}
                  onPress={() => lastDetectedSpeaker !== 'me' && handleSuggestionPress(s)}
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
                ) : isRecording ? (
                  <View style={styles.listeningRow}>
                    <View style={styles.listeningDot} />
                    <Text style={styles.micHintText}>
                      {lastDetectedSpeaker
                        ? `Last: ${lastDetectedSpeaker === 'me' ? myLang.name : theirLang.name} detected`
                        : 'Listening...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.micHintText}>Tap mic — hands-free mode</Text>
                )}
              </View>
              <Pressable
                style={[styles.micBtn, isRecording && styles.micBtnActive]}
                onPress={handleMicToggle}
                disabled={isProcessing}
              >
                <Text style={styles.micBtnIcon}>{isRecording ? '⏹' : '🎙'}</Text>
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
    paddingBottom: 200, // Extra padding so content isn't hidden by bottom bar
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
  micBtnActive: { backgroundColor: '#6c63ff33', borderColor: '#ff6b6b' },
  micBtnIcon: { fontSize: 28 },
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
  suggestionsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#1a1a3e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#6c63ff44',
  },
  suggestionChipPrediction: {
    backgroundColor: '#1e2a1e',
    borderColor: '#44aa6644',
  },
  suggestionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff6b6b',
  },
});
