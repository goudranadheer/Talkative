import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Conversation'>;
};

export default function ConversationScreen({ navigation }: Props) {
  const { briefing } = useApp();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Briefing</Text>
          </TouchableOpacity>
          <Text style={styles.langs}>
            {briefing.myLanguage?.name} ↔ {briefing.theirLanguage?.name}
          </Text>
        </View>

        {briefing.context ? (
          <View style={styles.contextBadge}>
            <Text style={styles.contextText}>{briefing.context}</Text>
          </View>
        ) : null}

        <View style={styles.center}>
          <Text style={styles.comingSoon}>Mic & Translation</Text>
          <Text style={styles.comingSoonSub}>Coming next</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f0f1a' },
  container: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn: { padding: 8 },
  backText: { color: '#6c63ff', fontSize: 15, fontWeight: '600' },
  langs: { color: '#fff', fontSize: 15, fontWeight: '700' },
  contextBadge: {
    backgroundColor: '#1e1e2e',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  contextText: { color: '#aaa', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  comingSoon: { color: '#fff', fontSize: 22, fontWeight: '700' },
  comingSoonSub: { color: '#555', fontSize: 14, marginTop: 6 },
});
