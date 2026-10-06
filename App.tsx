import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CardsProvider, useCards } from './src/context/CardsContext';
import { LocaleProvider } from './src/i18n/LocaleContext';
import { ThemeProvider, useAppTheme } from './src/theme/ThemeContext';
import { AppSettingsProvider, useAppSettings } from './src/context/AppSettingsContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LockGate } from './src/components/LockGate';
import { NotificationsSync } from './src/components/NotificationsSync';
import { navigationRef, goToWelcome } from './src/navigation/navigationRef';
import { DemoRibbon } from './src/components/DemoRibbon';
import { useFonts } from 'expo-font';
import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
} from '@expo-google-fonts/bricolage-grotesque';

// Screens that are not part of the demo itself (welcome, auth and setup
// flows) never show the DEMO ribbon. A nested tab route reports its tab's
// name (Home, Calendar…), which is why this is a deny-list.
const NO_RIBBON = new Set(['Onboarding', 'DemoIntro', 'Auth', 'SecuritySetup', 'PinSetup', 'NotifPrimer']);

function AppContent() {
  const { colors, isDark } = useAppTheme();
  const { loaded: cardsLoaded, isDemo } = useCards();
  const { session, loading: authLoading } = useAuth();
  const [routeName, setRouteName] = useState<string | undefined>();

  // Whenever a signed-in session ends (sign out, account deleted, expired),
  // go back to the welcome screen instead of silently showing demo data in
  // place of the user's own.
  const hadSession = useRef(false);
  useEffect(() => {
    if (hadSession.current && !session) goToWelcome();
    hadSession.current = !!session;
  }, [session]);
  const { loaded: settingsLoaded } = useAppSettings();
  // Display font for titles/amounts. If it fails to load, carry on with the
  // system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
  });

  if (authLoading || !cardsLoaded || !settingsLoaded || (!fontsLoaded && !fontError)) {
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
    <LockGate>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {isDemo && routeName && !NO_RIBBON.has(routeName) && (
          <DemoRibbon onExit={() => navigationRef.navigate('DemoExit')} />
        )}
        {/* A nested provider measures safe-area insets relative to itself, so
            when the DEMO ribbon sits above, screens below it get a top inset
            of 0 instead of leaving a second status-bar-sized gap. */}
        <SafeAreaProvider style={{ flex: 1 }}>
        <NavigationContainer
          theme={navTheme}
          ref={navigationRef}
          onReady={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
          onStateChange={() => setRouteName(navigationRef.getCurrentRoute()?.name)}
        >
          <RootNavigator />
        </NavigationContainer>
        </SafeAreaProvider>
      </View>
    </LockGate>
  );
}

function Root() {
  const { isDark } = useAppTheme();
  return (
    <CardsProvider>
      <AppContent />
      <NotificationsSync />
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
