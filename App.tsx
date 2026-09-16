import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CardsProvider, useCards } from './src/context/CardsContext';
import { LocaleProvider } from './src/i18n/LocaleContext';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeContext';
import { AppSettingsProvider, useAppSettings } from './src/context/AppSettingsContext';
import { AuthProvider } from './src/context/AuthContext';

function AppContent() {
  const { colors, isDark } = useAppTheme();
  const { loaded: cardsLoaded } = useCards();
  const { loaded: settingsLoaded } = useAppSettings();

  if (!cardsLoaded || !settingsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

function Root() {
  const { isDark } = useAppTheme();
  return (
    <CardsProvider>
      <AppContent />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </CardsProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <LocaleProvider>
          <AppSettingsProvider>
            <AuthProvider>
              <Root />
            </AuthProvider>
          </AppSettingsProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
