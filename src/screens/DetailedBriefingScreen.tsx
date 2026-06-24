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
import { callDeepSeek, callClaude } from '../services/reasoning';
import Groq from 'groq-sdk';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DetailedBriefing'>;
};

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
};

export default function DetailedBriefingScreen({ navigation }: Props) {
  const { briefing, setBriefing, groqApiKey, deepseekApiKey, claudeApiKey } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const systemPrompt = `You are a sharp, experienced conversation coach preparing a ${briefing.myLanguage?.name} speaker for a live conversation with a ${briefing.theirLanguage?.name} speaker.

Your role across this interview:
1. Understand the user's goal and the full context of the meeting.
2. Identify the most likely questions, objections, or scenarios the ${briefing.theirLanguage?.name} speaker will raise.
3. Drill the user with specific "What if they say..." challenges to surface any weak points.
4. Extract key details: names, numbers, constraints, non-negotiables.
5. After 4-6 focused exchanges, once you have a complete picture, summarise the strategy clearly and end your message with exactly: "You are ready. Tap Ready to begin."

Rules:
- Ask only ONE focused question per message — never multiple at once.
- Always respond in ${briefing.myLanguage?.name}.
- Be direct and efficient. This is pre-game preparation, not a therapy session.`;

  useEffect(() => {
    const startInterview = async () => {
      setLoading(true);
      try {
        const chatMessages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: 'Start the interview.' },
        ];
        let content: string;
        if (claudeApiKey) {
          content = await callClaude(chatMessages, { max_tokens: 300, temperature: 0.7 }, claudeApiKey);
        } else if (deepseekApiKey) {
          content = await callDeepSeek(chatMessages, { max_tokens: 300 }, deepseekApiKey);
        } else {
          const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: chatMessages, max_tokens: 300 });
          content = response.choices[0]?.message?.content ?? '';
        }
        setMessages([{ role: 'assistant', content: content || "Tell me — who are you meeting and what do you need to achieve from this conversation?" }]);
      } catch (e) {
        setMessages([{ role: 'assistant', content: "Tell me — who are you meeting and what do you need to achieve from this conversation?" }]);
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
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...newMessages,
      ];
      let aiContent: string;
      if (claudeApiKey) {
        aiContent = await callClaude(chatMessages, { max_tokens: 400, temperature: 0.7 }, claudeApiKey);
      } else if (deepseekApiKey) {
        aiContent = await callDeepSeek(chatMessages, { max_tokens: 400, temperature: 0.7 }, deepseekApiKey);
      } else {
        const client = new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true });
        const response = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: chatMessages, max_tokens: 400 });
        aiContent = response.choices[0]?.message?.content ?? '';
      }
      setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
    } catch (e) {
      console.error(e);
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
          <Text style={styles.headerTitle}>Deep Briefing</Text>
          <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
            <Text style={styles.finishText}>Ready</Text>
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
                <Text style={styles.msgText}>{item.content}</Text>
              </View>
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        </View>

        {loading && <ActivityIndicator style={{ marginBottom: 10 }} color="#6c63ff" />}

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Type your answer..."
            placeholderTextColor="#666"
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
  safe: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  finishBtn: { backgroundColor: '#6c63ff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  finishText: { color: '#fff', fontWeight: '700' },
  msg: { maxWidth: '85%', padding: 12, borderRadius: 16, marginBottom: 12 },
  aiMsg: { alignSelf: 'flex-start', backgroundColor: '#1e1e2e' },
  userMsg: { alignSelf: 'flex-end', backgroundColor: '#6c63ff' },
  msgText: { color: '#fff', fontSize: 15 },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#161625',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  input: { flex: 1, backgroundColor: '#1e1e2e', color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 100 },
  sendBtn: { marginLeft: 12, backgroundColor: '#6c63ff', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
