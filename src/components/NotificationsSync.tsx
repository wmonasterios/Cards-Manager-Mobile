import { useEffect } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  scheduleWeeklySummary,
  cancelWeeklySummary,
  registerPushToken,
} from '../notifications';

export function NotificationsSync() {
  const { reminder, weekly, notifyNew, loaded: settingsLoaded } = useAppSettings();
  const { cards, isDemo, loaded: cardsLoaded } = useCards();
  const { session } = useAuth();

  useEffect(() => {
    if (!settingsLoaded || !cardsLoaded || isDemo) return;
    if (reminder) {
      schedulePaymentReminders(cards);
    } else {
      cancelPaymentReminders();
    }
  }, [reminder, cards, isDemo, settingsLoaded, cardsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (weekly) {
      scheduleWeeklySummary();
    } else {
      cancelWeeklySummary();
    }
  }, [weekly, settingsLoaded]);

  useEffect(() => {
    if (notifyNew && session?.user.id) {
      registerPushToken(session.user.id);
    }
  }, [notifyNew, session?.user.id]);

  return null;
}
