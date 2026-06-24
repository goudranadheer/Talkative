import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { useApp, Language, TranslationMode } from '../context/AppContext';
import { LANGUAGES } from '../constants/languages';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Briefing'>;
};

export default function BriefingScreen({ navigation }: Props) {
  const { briefing, setBriefing, groqApiKey, setGroqApiKey, deepseekApiKey, setDeepseekApiKey, claudeApiKey, setClaudeApiKey, translationMode, setTranslationMode, clearMessages } = useApp();
  const [myLanguage, setMyLanguage] = useState<Language | null>(briefing.myLanguage);
  const [theirLanguage, setTheirLanguage] = useState<Language | null>(briefing.theirLanguage);
  const [context, setContext] = useState(briefing.context);
  const [mode, setMode] = useState<'brief' | 'detailed'>(briefing.mode);
  const [localGroqKey, setLocalGroqKey] = useState(groqApiKey);
  const [localDeepseekKey, setLocalDeepseekKey] = useState(deepseekApiKey);
  const [localClaudeKey, setLocalClaudeKey] = useState(claudeApiKey);
  const [pickerTarget, setPickerTarget] = useState<'mine' | 'theirs' | null>(null);

  const hasLLMKey =
    localGroqKey.trim().length > 0 ||
    localDeepseekKey.trim().length > 0 ||
    localClaudeKey.trim().length > 0;

  // Provider precedence for AI mode: Claude > DeepSeek > Groq.
  const aiProviderLabel = localClaudeKey.trim()
    ? 'Claude Haiku 4.5'
    : localDeepseekKey.trim()
    ? 'DeepSeek V4'
    : 'Groq Llama';
  const canStart =
    myLanguage &&
    theirLanguage &&
    myLanguage.value !== theirLanguage.value &&
    (translationMode === 'free' || hasLLMKey) &&
    (mode === 'detailed' || context.trim().length > 0);

  function handleStart() {
    clearMessages(); // always start fresh when tapping Start Conversation
    setBriefing({ myLanguage, theirLanguage, context, mode });
    setGroqApiKey(localGroqKey.trim());
    setDeepseekApiKey(localDeepseekKey.trim());
    setClaudeApiKey(localClaudeKey.trim());
    if (mode === 'detailed') {
      navigation.navigate('DetailedBriefing' as any);
    } else {
      navigation.navigate('Conversation');
    }
  }

  function selectLanguage(lang: Language) {
    if (pickerTarget === 'mine') setMyLanguage(lang);
    else setTheirLanguage(lang);
    setPickerTarget(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Talkative</Text>
        <Text style={styles.subtitle}>Set up your conversation</Text>

        {/* Language pickers */}
        <Text style={styles.label}>Your language</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerTarget('mine')}>
          <Text style={myLanguage ? styles.pickerText : styles.pickerPlaceholder}>
            {myLanguage ? myLanguage.label : 'Select your language'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Their language</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerTarget('theirs')}>
          <Text style={theirLanguage ? styles.pickerText : styles.pickerPlaceholder}>
            {theirLanguage ? theirLanguage.label : "Select their language"}
          </Text>
        </TouchableOpacity>

        {myLanguage && theirLanguage && myLanguage.value === theirLanguage.value && (
          <Text style={styles.error}>Languages must be different</Text>
        )}

        {/* Briefing Mode Selection */}
        <Text style={styles.label}>Briefing Mode</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'brief' && styles.modeBtnActive]}
            onPress={() => setMode('brief')}
          >
            <Text style={[styles.modeBtnText, mode === 'brief' && styles.modeBtnTextActive]}>
              Brief
            </Text>
            <Text style={[styles.modeBtnSub, mode === 'brief' && styles.modeBtnSubActive]}>
              Quick summary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'detailed' && styles.modeBtnActive]}
            onPress={() => setMode('detailed')}
          >
            <Text style={[styles.modeBtnText, mode === 'detailed' && styles.modeBtnTextActive]}>
              Detailed
            </Text>
            <Text style={[styles.modeBtnSub, mode === 'detailed' && styles.modeBtnSubActive]}>
              To-and-fro interview
            </Text>
          </TouchableOpacity>
        </View>

        {/* Context - Only show if mode is brief */}
        {mode === 'brief' && (
          <>
            <Text style={styles.label}>Your goal</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. I'm in a job interview and want to negotiate a salary of at least €50,000. I have 5 years of experience."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              value={context}
              onChangeText={setContext}
            />
          </>
        )}

        {/* Translation mode toggle */}
        <Text style={styles.label}>Translation mode</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, translationMode === 'free' && styles.modeBtnActive]}
            onPress={() => setTranslationMode('free')}
          >
            <Text style={[styles.modeBtnText, translationMode === 'free' && styles.modeBtnTextActive]}>
              Free
            </Text>
            <Text style={[styles.modeBtnSub, translationMode === 'free' && styles.modeBtnSubActive]}>
              MyMemory · No key needed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, translationMode === 'reasoning' && styles.modeBtnActive]}
            onPress={() => setTranslationMode('reasoning')}
          >
            <Text style={[styles.modeBtnText, translationMode === 'reasoning' && styles.modeBtnTextActive]}>
              AI
            </Text>
            <Text style={[styles.modeBtnSub, translationMode === 'reasoning' && styles.modeBtnSubActive]}>
              {aiProviderLabel} · Context-aware
            </Text>
          </TouchableOpacity>
        </View>

        {/* Groq key — unlocks mic (Whisper STT) */}
        <Text style={styles.label}>
          Groq API Key{' '}
          <Text style={styles.optional}>(free at console.groq.com — unlocks mic)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="gsk_... (optional — text input works without it)"
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          value={localGroqKey}
          onChangeText={setLocalGroqKey}
        />

        {/* Claude key — best AI quality; takes priority over DeepSeek/Groq */}
        <Text style={styles.label}>
          Claude API Key{' '}
          <Text style={styles.optional}>(console.anthropic.com — best translation & suggestions)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="sk-ant-... (optional — Claude Haiku 4.5, fast + highest quality)"
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          value={localClaudeKey}
          onChangeText={setLocalClaudeKey}
        />

        {/* DeepSeek key — upgrades LLM from Groq Llama to DeepSeek V4 */}
        <Text style={styles.label}>
          DeepSeek API Key{' '}
          <Text style={styles.optional}>(platform.deepseek.com — better AI suggestions)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="sk-... (optional — falls back to Groq LLM)"
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          value={localDeepseekKey}
          onChangeText={setLocalDeepseekKey}
        />

        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          disabled={!canStart}
        >
          <Text style={styles.startButtonText}>Start Conversation</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Language picker modal */}
      <Modal visible={pickerTarget !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pickerTarget === 'mine' ? 'Your language' : 'Their language'}
            </Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.langItem} onPress={() => selectLanguage(item)}>
                  <Text style={styles.langItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerTarget(null)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f1a' },
  container: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#bbb', marginBottom: 8, marginTop: 16 },
  optional: { fontWeight: '400', color: '#666' },
  picker: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  pickerText: { color: '#fff', fontSize: 16 },
  pickerPlaceholder: { color: '#555', fontSize: 16 },
  input: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  error: { color: '#ff6b6b', fontSize: 13, marginTop: 6 },
  modeToggle: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#1a1a3e', borderColor: '#6c63ff' },
  modeBtnText: { color: '#666', fontSize: 15, fontWeight: '700' },
  modeBtnTextActive: { color: '#fff' },
  modeBtnSub: { color: '#444', fontSize: 11, marginTop: 4, textAlign: 'center' },
  modeBtnSubActive: { color: '#6c63ff' },
  startButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 36,
  },
  startButtonDisabled: { backgroundColor: '#3a3a5c', opacity: 0.6 },
  startButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1e1e2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  langItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  langItemText: { fontSize: 16, color: '#fff' },
  cancelButton: { marginTop: 16, alignItems: 'center', padding: 14 },
  cancelButtonText: { color: '#6c63ff', fontSize: 16, fontWeight: '600' },
});
