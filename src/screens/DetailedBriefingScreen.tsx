import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { aiCoach, ApiError } from '../services/api';
import { colors, hudLabel, radii, glow } from '../constants/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DetailedBriefing'>;
};

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

const FALLBACK_OPENER =
  'Tell me — who are you meeting and what do you need to achieve from this conversation?';

export default function DetailedBriefingScreen({ navigation }: Props) {
  const { briefing, setBriefing } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const coachParams = {
    myLanguage: briefing.myLanguage?.name ?? 'English',
    theirLanguage: briefing.theirLanguage?.name ?? 'English',
  };

  useEffect(() => {
    const startInterview = async () => {
      setLoading(true);
      try {
        const content = await aiCoach({
          ...coachParams,
          messages: [{ role: 'user', content: 'Start the interview.' }],
        });
        setMessages([{ role: 'assistant', content: content || FALLBACK_OPENER }]);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'quota_exhausted') setError(e.message);
        setMessages([{ role: 'assistant', content: FALLBACK_OPENER }]);
      } finally {
        setLoading(false);
      }
    };
    startInterview();
  }, []);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setError('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const aiContent = await aiCoach({ ...coachParams, messages: newMessages });
      setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
    } catch (e: any) {
      setError(e?.message ?? 'The coach is unreachable. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleFinish() {
    // Combine all info into the briefing context
    const fullContext = messages.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`).join('\n');
    setBriefing({ ...briefing, context: fullContext });
    navigation.navigate('Conversation');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>DEEP BRIEFING</Text>
            <Text style={styles.headerSub}>AI STRATEGY COACH</Text>
          </View>
          <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
            <Text style={styles.finishText}>READY ➜</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, i) => i.toString()}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            renderItem={({ item }) => (
              <View style={[styles.msg, item.role === 'user' ? styles.userMsg : styles.aiMsg]}>
                {item.role === 'assistant' && <Text style={styles.coachTag}>COACH</Text>}
                <Text style={styles.msgText}>{item.content}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        </View>

        {loading && <ActivityIndicator style={{ marginBottom: 10 }} color={colors.primary} />}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Type your answer..."
            placeholderTextColor={colors.textFaint}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  headerSub: { ...hudLabel, color: colors.primary, fontSize: 9, marginTop: 3 },
  finishBtn: {
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    ...glow,
    shadowOpacity: 0.3,
  },
  finishText: { color: colors.primary, fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  msg: { maxWidth: '85%', padding: 14, borderRadius: radii.md, marginBottom: 12, borderWidth: 1 },
  aiMsg: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border },
  userMsg: { alignSelf: 'flex-end', backgroundColor: colors.accentDim, borderColor: colors.accent },
  coachTag: { ...hudLabel, fontSize: 9, color: colors.primary, marginBottom: 6 },
  msgText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginBottom: 8, marginHorizontal: 16 },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    marginLeft: 12,
    backgroundColor: colors.primary,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow,
    shadowOpacity: 0.4,
  },
  sendIcon: { color: '#03121A', fontSize: 20, fontWeight: '800' },
});
