import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { TabNavigator } from './TabNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { CardDetailScreen } from '../screens/CardDetailScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { PayScreen } from '../screens/PayScreen';
import { BestScreen } from '../screens/BestScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { FixScreen } from '../screens/FixScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { AddCardScreen } from '../screens/AddCardScreen';
import { NotifPrimerScreen } from '../screens/NotifPrimerScreen';
import { SecuritySetupScreen } from '../screens/SecuritySetupScreen';
import { PinSetupScreen } from '../screens/PinSetupScreen';
import { DemoIntroScreen } from '../screens/DemoIntroScreen';
import { DemoExitScreen } from '../screens/DemoExitScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const colors = useColors();
  // Signed in → straight to the app. Nobody signed in → the welcome screen
  // (log in, create an account or open the clearly-labelled demo).
  const { session } = useAuth();

  return (
    <Stack.Navigator
      initialRouteName={session ? 'Tabs' : 'Onboarding'}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'ios_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="CardDetail" component={CardDetailScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen name="Pay" component={PayScreen} />
      <Stack.Screen name="Best" component={BestScreen} />
      <Stack.Screen name="Report" component={ReportScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Fix" component={FixScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="NotifPrimer" component={NotifPrimerScreen} options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="SecuritySetup" component={SecuritySetupScreen} options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen
        name="DemoIntro"
        component={DemoIntroScreen}
        options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen
        name="DemoExit"
        component={DemoExitScreen}
        options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen name="PinSetup" component={PinSetupScreen} options={{ presentation: 'modal', gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
