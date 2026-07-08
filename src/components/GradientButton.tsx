import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, glow, radii } from '../constants/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  compact?: boolean;
};

export default function GradientButton({ title, onPress, disabled, loading, style, compact }: Props) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      style={[!inactive && glow, style]}
    >
      <LinearGradient
        colors={inactive ? gradients.disabled : gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.grad, compact && styles.gradCompact]}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.text, compact && styles.textCompact, inactive && styles.textDisabled]}>
            {title}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  grad: {
    borderRadius: radii.md,
    paddingVertical: 17,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradCompact: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radii.pill },
  text: {
    color: '#03121A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  textCompact: { fontSize: 13, letterSpacing: 1 },
  textDisabled: { color: colors.textFaint },
});
