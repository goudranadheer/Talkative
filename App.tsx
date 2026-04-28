import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppProvider } from './src/context/AppContext';
import BriefingScreen from './src/screens/BriefingScreen';
import DetailedBriefingScreen from './src/screens/DetailedBriefingScreen';
import ConversationScreen from './src/screens/ConversationScreen';

export type RootStackParamList = {
  Briefing: undefined;
  DetailedBriefing: undefined;
  Conversation: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Briefing" component={BriefingScreen} />
          <Stack.Screen name="DetailedBriefing" component={DetailedBriefingScreen} />
          <Stack.Screen name="Conversation" component={ConversationScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
