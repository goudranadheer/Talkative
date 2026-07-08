import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppProvider, useApp } from './src/context/AppContext';
import AuthScreen from './src/screens/AuthScreen';
import BriefingScreen from './src/screens/BriefingScreen';
import DetailedBriefingScreen from './src/screens/DetailedBriefingScreen';
import ConversationScreen from './src/screens/ConversationScreen';
import { colors } from './src/constants/theme';

export type RootStackParamList = {
  Briefing: undefined;
  DetailedBriefing: undefined;
  Conversation: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function Root() {
  const { session, sessionLoading } = useApp();

  if (sessionLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Briefing" component={BriefingScreen} />
        <Stack.Screen name="DetailedBriefing" component={DetailedBriefingScreen} />
        <Stack.Screen name="Conversation" component={ConversationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
