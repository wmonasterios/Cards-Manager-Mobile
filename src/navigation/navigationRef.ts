import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// A push notification can arrive (and be tapped) before the NavigationContainer
// has mounted, e.g. a cold start — retry briefly instead of dropping the deep link.
function navigateWhenReady(action: () => void, attemptsLeft = 20) {
  if (navigationRef.isReady()) {
    action();
    return;
  }
  if (attemptsLeft <= 0) return;
  setTimeout(() => navigateWhenReady(action, attemptsLeft - 1), 250);
}

export function navigateToStatementReview(statementId: string) {
  navigateWhenReady(() => {
    navigationRef.navigate('Tabs', { screen: 'Statements', params: { statementId } });
  });
}

export function navigateToStatements() {
  navigateWhenReady(() => {
    navigationRef.navigate('Tabs', { screen: 'Statements' });
  });
}

export function navigateToCardDetail(cardId: string) {
  navigateWhenReady(() => {
    navigationRef.navigate('CardDetail', { cardId });
  });
}
