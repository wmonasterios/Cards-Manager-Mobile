export type RootStackParamList = {
  Home: undefined;
  CardDetail: { cardId: string };
  Transactions: { initialQuery?: string };
  TransactionDetail: { txId: string; cardId: string };
  Pay: { cardId: string };
  Statements: undefined;
};
