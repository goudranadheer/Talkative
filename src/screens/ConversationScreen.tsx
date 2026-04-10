import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useApp, Message } from '../context/AppContext';
import { translate } from '../services/translator';
import { translateWithReasoning } from '../services/reasoning';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Conversation'>;
};

type ActiveSpeaker = 'me' | 'them';

export default function ConversationScreen({ navigation }: Props) {
  const { briefing, messages, addMessage, clearMessages, groqApiKey, translationMode } = useApp();
  const [inputText, setInputText] = useState('');
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker>('them');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList>(null);

  const myLang = briefing.myLanguage!;
  const theirLang = briefing.theirLanguage!;

  async function handleTranslate() {
    const text = inputText.trim();
    if (!text || loading) return;

    setInputText('');
    setError('');
    setLoading(true);

    try {
      const fromLang = activeSpeaker === 'them' ? theirLang : myLang;
      const toLang = activeSpeaker === 'them' ? myLang : theirLang;

      let translated: string;

      if (translationMode === 'reasoning') {
        translated = await translateWithReasoning({
          text,
          fromLanguage: fromLang.name,
          toLanguage: toLang.name,
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
        speaker: activeSpeaker,
        original: text,
        translated,
        timestamp: new Date(),
      };

      addMessage(msg);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setError(e?.message ?? 'Translation failed. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    const isMe = item.speaker === 'me';
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={styles.bubbleSpeaker}>{isMe ? myLang.name : theirLang.name}</Text>
        <Text style={styles.bubbleOriginal}>{item.original}</Text>
        <View style={styles.divider} />
        <Text style={styles.bubbleTranslated}>{item.translated}</Text>
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
          <Text style={styles.langPair}>
            {myLang.name} ↔ {theirLang.name}
          </Text>
          <TouchableOpacity onPress={clearMessages}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {briefing.context ? (
          <View style={styles.contextBadge}>
            <Text style={styles.contextText}>{briefing.context}</Text>
          </View>
        ) : null}

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Conversation will appear here</Text>
              <Text style={styles.emptySubText}>Select who is speaking and type what they said</Text>
            </View>
          }
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Speaker toggle */}
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

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={`Type what ${activeSpeaker === 'them' ? theirLang.name : myLang.name} speaker said...`}
            placeholderTextColor="#555"
            value={inputText}
            onChangeText={setInputText}
            multiline
            onSubmitEditing={handleTranslate}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleTranslate}
            disabled={!inputText.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
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
  messageList: { padding: 16, paddingBottom: 8 },
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
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a3e',
    borderColor: '#6c63ff44',
  },
  bubbleThem: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e1e2e',
    borderColor: '#333',
  },
  bubbleSpeaker: { fontSize: 11, color: '#666', marginBottom: 4, fontWeight: '600', textTransform: 'uppercase' },
  bubbleOriginal: { color: '#ccc', fontSize: 15 },
  divider: { height: 1, backgroundColor: '#2a2a3e', marginVertical: 8 },
  bubbleTranslated: { color: '#fff', fontSize: 15, fontWeight: '500' },
  error: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginHorizontal: 16, marginBottom: 8 },
  speakerToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
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
    alignItems: 'flex-end',
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
});
