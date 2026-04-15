import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const { briefing, setBriefing, groqApiKey } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const client = useMemo(() => new Groq({ apiKey: groqApiKey, dangerouslyAllowBrowser: true }), [groqApiKey]);

  useEffect(() => {
    // Initial message from AI
    const startInterview = async () => {
      setLoading(true);
      const prompt = `You are a professional conversation coach and strategist.
      The user is about to have a conversation with a ${briefing.theirLanguage?.name} speaker.
      Your job is to interview the user in ${briefing.myLanguage?.name} to build a comprehensive mental model of this encounter.

      You must:
      1. Understand the high-level context and goals.
      2. PROACTIVELY anticipate what the ${briefing.theirLanguage?.name} speaker might ask or say to the user.
      3. Help the user prepare for those specific scenarios.
      4. Gather any critical details (names, numbers, specific constraints).

      Start by asking a broad question about the situation, but show that you are already thinking about what the other person might bring up.`;

      try {
        const response = await client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: prompt }],
        });
        const content = response.choices[0]?.message?.content || "Tell me more about who you're meeting and what you want to achieve.";
        setMessages([{ role: 'assistant', content }]);
      } catch (e) {
        setMessages([{ role: 'assistant', content: "Let's start. Who are you meeting and what is your goal for this conversation?" }]);
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
      const response = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `You are a conversation coach. Based on the user's input, dive deeper.
          Identify potential "friction points" or questions the ${briefing.theirLanguage?.name} speaker might ask.
          Challenge the user with "What if they say..." or "How would you respond if they ask about..." scenarios.
          Continue the interview until you have a rock-solid understanding of the likely flow of the conversation.
          When you have enough info, provide a summary of your strategy and tell the user they are ready to 'Ready'.` },
          ...newMessages
        ],
      });
      const aiContent = response.choices[0]?.message?.content || "";
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
