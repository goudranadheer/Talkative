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
import { useApp, Language } from '../context/AppContext';
import { LANGUAGES } from '../constants/languages';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Briefing'>;
};

export default function BriefingScreen({ navigation }: Props) {
  const { briefing, setBriefing, apiKey, setApiKey } = useApp();
  const [myLanguage, setMyLanguage] = useState<Language | null>(briefing.myLanguage);
  const [theirLanguage, setTheirLanguage] = useState<Language | null>(briefing.theirLanguage);
  const [context, setContext] = useState(briefing.context);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [pickerTarget, setPickerTarget] = useState<'mine' | 'theirs' | null>(null);

  const canStart = myLanguage && theirLanguage && myLanguage.value !== theirLanguage.value && localApiKey.trim().length > 0;

  function handleStart() {
    setBriefing({ myLanguage, theirLanguage, context });
    setApiKey(localApiKey.trim());
    navigation.navigate('Conversation');
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

        <Text style={styles.label}>Conversation context <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g. Job interview, doctor's appointment, tourist asking for directions..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
          value={context}
          onChangeText={setContext}
        />

        <Text style={styles.label}>Anthropic API Key</Text>
        <TextInput
          style={styles.input}
          placeholder="sk-ant-..."
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          value={localApiKey}
          onChangeText={setLocalApiKey}
        />

        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          disabled={!canStart}
        >
          <Text style={styles.startButtonText}>Start Conversation</Text>
        </TouchableOpacity>
      </ScrollView>

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
