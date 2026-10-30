import { NavigatorScreenParams } from '@react-navigation/native';
import type { StatementsFrom, TransactionsFrom } from '../analytics';

export type TabParamList = {
  Home: { tour?: boolean } | undefined;
  Calendar: undefined;
  Insights: undefined;
  // from: where the user came from, for analytics (absent = the tab bar).
  Statements: { cardId?: string; statementId?: string; from?: StatementsFrom } | undefined;
  Settings: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Onboarding: undefined;
  CardDetail: { cardId: string };
  // member: an additional card's last 4 digits, or 'main' for the principal's lines.
  Transactions: { initialQuery?: string; cardId?: string; member?: string; from?: TransactionsFrom };
  TransactionDetail: { txId: string; cardId: string };
  Pay: { cardId: string };
  Best: undefined;
  // statementId: report about that statement (from its review or detail).
  Report: { statementId?: string; source?: 'review' | 'statement'; label?: string } | undefined;
  Fix: undefined;
  Auth: { fromOnboarding?: boolean; mode?: 'signin' | 'signup' } | undefined;
  DemoIntro: undefined;
  DemoExit: undefined;
  AddCard: undefined;
  NotifPrimer: undefined;
  SecuritySetup: { fromOnboarding?: boolean } | undefined;
  StatementDetail: { statementId: string };
  Advisor: undefined;
  AdvisorMemory: undefined;
  PinSetup: { isChange?: boolean; fromOnboarding?: boolean; thenFinishAuth?: boolean } | undefined;
};
