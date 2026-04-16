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
  const { state: recorderState, startRecording, stopRecording, cancelRecording } = useAudioRecorder();
  const [micPaused, setMicPaused] = useState(false); // true while user is speaking their response

  const myLang = briefing.myLanguage!;
  const theirLang = briefing.theirLanguage!;
  const micEnabled = groqApiKey.trim().length > 0;
  const isRecording = recorderState === 'recording';
  const isProcessing = recorderState === 'processing' || loading;

  // Debounce suggestion generation — waits 1.5s after the last chunk
  // so suggestions only fire once after the other person stops talking,
  // not once per 5-second recording chunk while they are mid-sentence.
  const suggestionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMessagesRef = useRef<Message[]>([]);

  function scheduleSuggestions(currentMessages: Message[]) {
    pendingMessagesRef.current = currentMessages;
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    suggestionTimerRef.current = setTimeout(async () => {
      try {
        const sugs = await generateSuggestions({
          history: pendingMessagesRef.current,
          conversationContext: briefing.context,
          myLanguage: myLang.name,
          theirLanguage: theirLang.name,
          groqApiKey,
        });
        setSuggestions(sugs);
      } catch (e) {
        console.error('Failed to update suggestions:', e);
      }
    }, 1500);
  }

  function cancelSuggestions() {
    if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    setSuggestions([]);
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

      if (speaker === 'them') {
        // Other person spoke — schedule suggestions after a pause
        scheduleSuggestions(newMessages);
      } else {
        // User responded — cancel any pending suggestion and clear panel
        cancelSuggestions();
      }

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

      if (ttsEnabled) {
        if (speaker === 'them') {
          // Other person spoke — speak translation in user's language so they understand
          await speak(msg.translated, myLang.value);
        } else {
          // User tapped a suggestion — speak the translation in other person's language
          // so user knows exactly how to say it aloud
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

    // Stop mic immediately — don't let it pick up the user reading the suggestion aloud
    const wasMicOn = isRecording;
    if (wasMicOn) {
      await cancelRecording();
      setMicPaused(true);
    }

    // Translate suggestion and speak it in the other person's language
    await handleTranslateText(suggestion, 'me');

    // Resume listening after TTS finishes + 5s buffer.
    // The user needs time to actually say the sentence to the other person.
    // Too short = mic picks up the user speaking and re-translates it.
    if (wasMicOn) {
      setTimeout(async () => {
        setMicPaused(false);
        try {
          await startRecording(handleSilenceDetected);
        } catch (e) {}
      }, 5000);
    }
  }

  async function handleSendText() {
    const text = inputText.trim();
    if (!text || isProcessing) return;
    setInputText('');
    await handleTranslateText(text, activeSpeaker);
  }

  const micActiveRef = useRef(false); // tracks if hands-free session is on

  // Called by the silence detector in useAudioRecorder when the other person stops talking
  async function handleSilenceDetected() {
    if (!micActiveRef.current) return;
    await processRecording();
  }

  async function handleMicToggle() {
    if (isProcessing) return;

    if (isRecording || micPaused) {
      // End the hands-free session
      micActiveRef.current = false;
      setMicPaused(false);
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      if (isRecording) await processRecording();
    } else {
      // Start the hands-free session
      micActiveRef.current = true;
      stopSpeech();
      setSpeakingId(null);
      setError('');
      try {
        await startRecording(handleSilenceDetected);
      } catch (e: any) {
        micActiveRef.current = false;
        setError(e?.message ?? 'Failed to start microphone.');
      }
    }
  }

  async function processRecording() {
    try {
      const uri = await stopRecording();
      if (!uri) return;

      setLoading(true);

      // Restart listening immediately so we don't miss the next utterance
      if (micActiveRef.current) {
        await startRecording(handleSilenceDetected);
      }

      const { text, detectedLanguage } = await transcribe(uri, groqApiKey);
      if (!text) {
        setLoading(false);
        return;
      }

      // Use Whisper's detected language to figure out who spoke.
      // Their language → other person → translate to user's language + suggestions.
      // User's language → user is speaking (e.g. reading a suggestion aloud) → ignore.
      const theirLangCode = theirLang.value.toLowerCase().split('-')[0];
      const myLangCode    = myLang.value.toLowerCase().split('-')[0];
      const detected      = detectedLanguage.toLowerCase().split('-')[0];

      if (detected === myLangCode) {
        // User spoke in their own language — not relevant, keep listening
        setLoading(false);
        return;
      }

      // Either their language or unknown → treat as the other person speaking
      setLastDetectedSpeaker('them');
      await handleTranslateText(text, 'them');
    } catch (e: any) {
      console.error('Hands-free error:', e);
      setError(e?.message ?? 'Transcription failed.');
      micActiveRef.current = false;
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
            {isMe ? `SAY THIS IN ${theirLang.name.toUpperCase()}` : `THEM (${theirLang.name})`}
          </Text>
          <TouchableOpacity onPress={() => handleReplay(item)} style={styles.replayBtn}>
            <Text style={styles.replayIcon}>{isSpeaking ? '⏹' : '▶'}</Text>
          </TouchableOpacity>
        </View>

        {isMe ? (
          // Your response — show only the translation (what to say aloud)
          // No need to repeat the original chip text the user already read
          <Text style={styles.bubbleTranslated}>{item.translated}</Text>
        ) : (
          // Other person — show what they said + your language translation
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
                  {micEnabled ? 'Tap the mic to start listening' : 'Type what was said and tap send'}
                </Text>
              </View>
            }
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Suggestions — only shown after the other person speaks */}
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
                ) : micPaused ? (
                  <Text style={styles.micHintPaused}>
                    Say it aloud — resuming in a moment...
                  </Text>
                ) : isRecording ? (
                  <View style={styles.listeningRow}>
                    <View style={styles.listeningDot} />
                    <Text style={styles.micHintText}>
                      Listening for {theirLang.name}...
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.micHintText}>Tap mic to start listening</Text>
                )}
              </View>
              <Pressable
                style={[styles.micBtn, (isRecording || micPaused) && styles.micBtnActive]}
                onPress={handleMicToggle}
                disabled={isProcessing}
              >
                <Text style={styles.micBtnIcon}>{(isRecording || micPaused) ? '⏹' : '🎙'}</Text>
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
  micHintPaused: { color: '#6c63ff', fontSize: 13, fontStyle: 'italic' },
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
