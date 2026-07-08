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
import { LinearGradient } from 'expo-linear-gradient';
import { useApp, Language } from '../context/AppContext';
import { LANGUAGES } from '../constants/languages';
import GradientButton from '../components/GradientButton';
import { colors, hudLabel, radii, glow } from '../constants/theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Briefing'>;
};

export default function BriefingScreen({ navigation }: Props) {
  const { briefing, setBriefing, clearMessages, profile, session, signOut } = useApp();
  const [myLanguage, setMyLanguage] = useState<Language | null>(briefing.myLanguage);
  const [theirLanguage, setTheirLanguage] = useState<Language | null>(briefing.theirLanguage);
  const [context, setContext] = useState(briefing.context);
  const [mode, setMode] = useState<'brief' | 'detailed'>(briefing.mode);
  const [pickerTarget, setPickerTarget] = useState<'mine' | 'theirs' | null>(null);

  const remaining = profile ? Math.max(profile.quotaUnits - profile.usedUnits, 0) : null;
  const quotaPct = profile ? Math.max(0, Math.min(1, 1 - profile.usedUnits / profile.quotaUnits)) : 1;

  const canStart =
    !!myLanguage &&
    !!theirLanguage &&
    myLanguage.value !== theirLanguage.value &&
    (mode === 'detailed' || context.trim().length > 0);

  function handleStart() {
    clearMessages(); // always start fresh when tapping Start Conversation
    setBriefing({ myLanguage, theirLanguage, context, mode });
    if (mode === 'detailed') {
      navigation.navigate('DetailedBriefing');
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
      <LinearGradient
        colors={['rgba(0,229,255,0.10)', 'transparent']}
        style={styles.topGlow}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header: brand + account */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>TALKATIVE</Text>
            <Text style={styles.subtitle}>MISSION SETUP</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        {/* Quota HUD */}
        <View style={styles.quotaCard}>
          <View style={styles.quotaTopRow}>
            <Text style={hudLabel}>Free utterances left</Text>
            <Text style={styles.quotaValue}>
              {remaining !== null ? remaining : '—'}
              {profile ? <Text style={styles.quotaTotal}> / {profile.quotaUnits}</Text> : null}
            </Text>
          </View>
          <View style={styles.quotaTrack}>
            <LinearGradient
              colors={['#00E5FF', '#7C4DFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.quotaFill, { width: `${quotaPct * 100}%` }]}
            />
          </View>
          <Text style={styles.quotaEmail}>{session?.user.email}</Text>
        </View>

        {/* Language pickers */}
        <Text style={styles.label}>YOUR LANGUAGE</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerTarget('mine')}>
          <Text style={myLanguage ? styles.pickerText : styles.pickerPlaceholder}>
            {myLanguage ? myLanguage.label : 'Select your language'}
          </Text>
          <Text style={styles.pickerChevron}>▾</Text>
        </TouchableOpacity>

        <Text style={styles.label}>THEIR LANGUAGE</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setPickerTarget('theirs')}>
          <Text style={theirLanguage ? styles.pickerText : styles.pickerPlaceholder}>
            {theirLanguage ? theirLanguage.label : "Select their language"}
          </Text>
          <Text style={styles.pickerChevron}>▾</Text>
        </TouchableOpacity>

        {myLanguage && theirLanguage && myLanguage.value === theirLanguage.value && (
          <Text style={styles.error}>Languages must be different</Text>
        )}

        {/* Briefing Mode Selection */}
        <Text style={styles.label}>BRIEFING MODE</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'brief' && styles.modeBtnActive]}
            onPress={() => setMode('brief')}
          >
            <Text style={[styles.modeBtnText, mode === 'brief' && styles.modeBtnTextActive]}>
              BRIEF
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
              DETAILED
            </Text>
            <Text style={[styles.modeBtnSub, mode === 'detailed' && styles.modeBtnSubActive]}>
              AI coach interview
            </Text>
          </TouchableOpacity>
        </View>

        {/* Context - Only show if mode is brief */}
        {mode === 'brief' && (
          <>
            <Text style={styles.label}>YOUR GOAL</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. I'm in a job interview and want to negotiate a salary of at least €50,000. I have 5 years of experience."
              placeholderTextColor={colors.textFaint}
              multiline
              numberOfLines={3}
              value={context}
              onChangeText={setContext}
            />
          </>
        )}

        <GradientButton
          title="Start Conversation"
          onPress={handleStart}
          disabled={!canStart}
          style={{ marginTop: 36 }}
        />
      </ScrollView>

      {/* Language picker modal */}
      <Modal visible={pickerTarget !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pickerTarget === 'mine' ? 'YOUR LANGUAGE' : 'THEIR LANGUAGE'}
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
  safe: { flex: 1, backgroundColor: colors.bg },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  container: { padding: 24, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: 6 },
  subtitle: { ...hudLabel, color: colors.primary, marginTop: 6 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  signOutText: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  quotaCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 8,
    ...glow,
    shadowOpacity: 0.10,
  },
  quotaTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quotaValue: { color: colors.primary, fontSize: 20, fontWeight: '800' },
  quotaTotal: { color: colors.textFaint, fontSize: 13, fontWeight: '600' },
  quotaTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgElevated,
    marginTop: 12,
    overflow: 'hidden',
  },
  quotaFill: { height: 6, borderRadius: 3 },
  quotaEmail: { color: colors.textFaint, fontSize: 11, marginTop: 10 },
  label: { ...hudLabel, marginBottom: 8, marginTop: 20 },
  picker: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  pickerPlaceholder: { color: colors.textFaint, fontSize: 16 },
  pickerChevron: { color: colors.primary, fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: { height: 90, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: 13, marginTop: 6 },
  modeToggle: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.surfaceHi,
    borderColor: colors.primary,
    ...glow,
    shadowOpacity: 0.25,
  },
  modeBtnText: { color: colors.textFaint, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },
  modeBtnTextActive: { color: colors.text },
  modeBtnSub: { color: colors.textFaint, fontSize: 11, marginTop: 4, textAlign: 'center' },
  modeBtnSubActive: { color: colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,4,12,0.75)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { ...hudLabel, color: colors.primary, marginBottom: 16 },
  langItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  langItemText: { fontSize: 16, color: colors.text },
  cancelButton: { marginTop: 16, alignItems: 'center', padding: 14 },
  cancelButtonText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
