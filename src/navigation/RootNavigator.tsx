import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { colors } from '../theme';
import { HomeScreen } from '../screens/HomeScreen';
import { CardDetailScreen } from '../screens/CardDetailScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { PayScreen } from '../screens/PayScreen';
import { StatementsScreen } from '../screens/StatementsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="CardDetail" component={CardDetailScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen name="Pay" component={PayScreen} />
      <Stack.Screen
        name="Statements"
        component={StatementsScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
