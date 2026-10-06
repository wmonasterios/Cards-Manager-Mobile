import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: { tour?: boolean } | undefined;
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
  Auth: { fromOnboarding?: boolean; mode?: 'signin' | 'signup' } | undefined;
  DemoIntro: undefined;
  DemoExit: undefined;
  AddCard: undefined;
  NotifPrimer: undefined;
  SecuritySetup: { fromOnboarding?: boolean } | undefined;
  PinSetup: { isChange?: boolean; fromOnboarding?: boolean; thenFinishAuth?: boolean } | undefined;
};
