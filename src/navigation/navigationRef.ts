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

export function navigateToNotifPrimer() {
  navigateWhenReady(() => {
    navigationRef.navigate('NotifPrimer');
  });
}

// Lands in the main tabs as the ONLY route on the stack, so a swipe-back can
// never reveal the welcome/auth screens that led here.
export function enterApp(tab?: 'Home' | 'Statements', tour = false) {
  navigateWhenReady(() => {
    navigationRef.reset({
      index: 0,
      routes: [
        {
          name: 'Tabs',
          params: tab ? { screen: tab, params: tab === 'Home' ? { tour } : undefined } : undefined,
        },
      ],
    });
  });
}

// Back to the welcome screen (log in / create account / see the demo), e.g.
// after signing out or deleting the account.
export function goToWelcome() {
  navigateWhenReady(() => {
    navigationRef.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  });
}
