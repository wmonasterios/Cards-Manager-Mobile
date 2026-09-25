import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Calendar: undefined;
  Insights: undefined;
  Statements: { cardId?: string; statementId?: string } | undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Onboarding: undefined;
  CardDetail: { cardId: string };
  Transactions: { initialQuery?: string; cardId?: string };
  TransactionDetail: { txId: string; cardId: string };
  Pay: { cardId: string };
  Best: undefined;
  Report: undefined;
  Fix: undefined;
  Auth: undefined;
  AddCard: undefined;
};
