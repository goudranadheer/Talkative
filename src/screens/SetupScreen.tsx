import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, Modal, FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { saveProfile, DEFAULT_PROFILE, UserProfile } from '../services/memoryService';
import { LANGUAGES } from '../constants/languages';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Setup'> };

export default function SetupScreen({ navigation }: Props) {
  const [openAiKey, setOpenAiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState<{ value: string; name: string; label: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const canContinue = openAiKey.trim().length > 0 && language !== null;

  async function handleContinue() {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      openAiKey: openAiKey.trim(),
      groqApiKey: groqKey.trim(),
      name: name.trim(),
      city: city.trim(),
      nativeLanguage: language!.value,
      nativeLanguageName: language!.name,
    };
    await saveProfile(profile);
    navigation.replace('Assistant');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Talkative</Text>
        <Text style={s.headline}>Your AI life navigator{'\n'}in Germany</Text>
        <Text style={s.sub}>Set up once. The assistant learns your context and helps you navigate any situation.</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>Your Language</Text>
          <TouchableOpacity style={s.picker} onPress={() => setShowPicker(true)}>
            <Text style={language ? s.pickerText : s.pickerPlaceholder}>
              {language ? language.label : 'Select your native language'}
            </Text>
            <Text style={s.pickerArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>OpenAI API Key <Text style={s.required}>Required</Text></Text>
          <Text style={s.hint}>Powers real-time translation via GPT Realtime API</Text>
          <TextInput
            style={s.input}
            placeholder="sk-..."
            placeholderTextColor="#444"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={openAiKey}
            onChangeText={setOpenAiKey}
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Groq API Key <Text style={s.optional}>Optional</Text></Text>
          <Text style={s.hint}>Enables microphone — instant German speech detection (free at console.groq.com)</Text>
          <TextInput
            style={s.input}
            placeholder="gsk_..."
            placeholderTextColor="#444"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={groqKey}
            onChangeText={setGroqKey}
          />
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>About You <Text style={s.optional}>Optional — helps the assistant</Text></Text>
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]}
            placeholder="Your city in Germany (e.g. Munich)"
            placeholderTextColor="#444"
            value={city}
            onChangeText={setCity}
          />
        </View>

        <TouchableOpacity
          style={[s.btn, !canContinue && s.btnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={s.btnText}>Start Assistant</Text>
        </TouchableOpacity>

        <Text style={s.footer}>
          Your API keys are stored only on this device and sent directly to OpenAI/Groq.
        </Text>
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Your native language</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={item => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.langItem}
                  onPress={() => { setLanguage(item); setShowPicker(false); }}
                >
                  <Text style={s.langText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPicker(false)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a14' },
  container: { padding: 24, paddingBottom: 60 },
  logo: { fontSize: 15, color: '#6c63ff', fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16 },
  headline: { fontSize: 30, fontWeight: '800', color: '#fff', lineHeight: 38, marginBottom: 10 },
  sub: { fontSize: 14, color: '#666', lineHeight: 21, marginBottom: 32 },
  card: {
    backgroundColor: '#131320',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1e1e30',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#bbb', marginBottom: 4, letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#555', marginBottom: 10 },
  required: { color: '#6c63ff', fontWeight: '600' },
  optional: { color: '#444', fontWeight: '400' },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  pickerText: { color: '#fff', fontSize: 15 },
  pickerPlaceholder: { color: '#444', fontSize: 15 },
  pickerArrow: { color: '#555', fontSize: 20 },
  input: {
    backgroundColor: '#1a1a2a',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  btn: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  btnDisabled: { backgroundColor: '#2a2a40', opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footer: { fontSize: 11, color: '#333', textAlign: 'center', marginTop: 20, lineHeight: 17 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#131320',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  langItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1e1e30' },
  langText: { fontSize: 16, color: '#fff' },
  cancelBtn: { marginTop: 16, alignItems: 'center', padding: 14 },
  cancelText: { color: '#6c63ff', fontSize: 16, fontWeight: '600' },
});
