import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CardsProvider } from './src/context/CardsContext';
import { LocaleProvider } from './src/i18n/LocaleContext';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeContext';
import { AppSettingsProvider } from './src/context/AppSettingsContext';

function Root() {
  const { colors, isDark } = useAppTheme();
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
    <CardsProvider>
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
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
            <Root />
          </AppSettingsProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
