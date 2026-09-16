import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useColors } from '../theme/ThemeContext';
import { useAppSettings } from '../context/AppSettingsContext';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const colors = useColors();
  const { onboarded } = useAppSettings();

  return (
    <Stack.Navigator
      initialRouteName={onboarded ? 'Tabs' : 'Onboarding'}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
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
    </Stack.Navigator>
  );
}
