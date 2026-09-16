import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CardsProvider } from './src/context/CardsContext';
import { colors } from './src/theme';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.accent,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <CardsProvider>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="light" />
      </CardsProvider>
    </SafeAreaProvider>
  );
}
