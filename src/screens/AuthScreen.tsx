import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import GradientButton from '../components/GradientButton';
import { colors, hudLabel, radii, glow } from '../constants/theme';

// Password auth with auto-confirm (no emails sent) — the free-tier-friendly
// pilot flow. Swap back to OTP codes once custom SMTP is configured.
export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cleanEmail = email.trim().toLowerCase();
  const canSubmit = cleanEmail.includes('@') && password.length >= 6;

  async function handleSubmit() {
    setError('');
    setLoading(true);
    const { error: err } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        : await supabase.auth.signUp({ email: cleanEmail, password });
    setLoading(false);
    if (err) {
      if (/already registered/i.test(err.message)) {
        setError('This email already has an account — switch to Sign in.');
      } else if (/invalid login credentials/i.test(err.message)) {
        setError('Wrong email or password. New here? Switch to Create account.');
      } else {
        setError(err.message);
      }
    }
    // On success the auth listener in AppContext flips the app to the main flow.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          {/* Glow orb backdrop */}
          <LinearGradient
            colors={['rgba(0,229,255,0.18)', 'rgba(124,77,255,0.06)', 'transparent']}
            style={styles.orb}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />

          <Text style={styles.brandMark}>◇</Text>
          <Text style={styles.title}>TALKATIVE</Text>
          <Text style={styles.tagline}>REAL-TIME AI INTERPRETER</Text>

          <View style={styles.card}>
            {/* Mode toggle */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
                onPress={() => { setMode('signin'); setError(''); }}
              >
                <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>
                  SIGN IN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
                onPress={() => { setMode('signup'); setError(''); }}
              >
                <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>
                  CREATE ACCOUNT
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="you@university.edu"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder={mode === 'signup' ? 'Choose a password (min 6 chars)' : 'Password'}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <GradientButton
              title={mode === 'signin' ? 'Enter' : 'Create & enter'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={loading}
              style={{ marginTop: 16 }}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Text style={styles.footer}>Free pilot · includes trial conversation minutes</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 28, justifyContent: 'center' },
  orb: {
    position: 'absolute',
    top: 0,
    left: -80,
    right: -80,
    height: 380,
    borderBottomLeftRadius: 400,
    borderBottomRightRadius: 400,
  },
  brandMark: {
    fontSize: 42,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: colors.borderGlow,
    textShadowRadius: 18,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 8,
  },
  tagline: {
    ...hudLabel,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    ...glow,
    shadowOpacity: 0.12,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: colors.primaryDim, borderWidth: 1, borderColor: colors.primary },
  modeText: { color: colors.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  modeTextActive: { color: colors.primary },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    padding: 16,
    marginTop: 12,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 14, textAlign: 'center' },
  footer: {
    ...hudLabel,
    textAlign: 'center',
    marginTop: 32,
    color: colors.textFaint,
  },
});
