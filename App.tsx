import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppProvider } from './src/context/AppContext';
import SetupScreen from './src/screens/SetupScreen';
import AssistantScreen from './src/screens/AssistantScreen';
import BriefingScreen from './src/screens/BriefingScreen';
import DetailedBriefingScreen from './src/screens/DetailedBriefingScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import { useEffect, useState } from 'react';
import { loadProfile } from './src/services/memoryService';

export type RootStackParamList = {
  Setup: undefined;
  Assistant: undefined;
  Briefing: undefined;
  DetailedBriefing: undefined;
  Conversation: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<'Setup' | 'Assistant' | null>(null);

  useEffect(() => {
    loadProfile().then(profile => {
      setInitialRoute(profile.openAiKey.trim() ? 'Assistant' : 'Setup');
    });
  }, []);

  if (!initialRoute) return null;

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Assistant" component={AssistantScreen} />
      <Stack.Screen name="Briefing" component={BriefingScreen} />
      <Stack.Screen name="DetailedBriefing" component={DetailedBriefingScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AppProvider>
  );
}
