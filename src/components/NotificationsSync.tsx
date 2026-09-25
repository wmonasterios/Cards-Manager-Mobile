import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppSettings } from '../context/AppSettingsContext';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { navigateToStatementReview } from '../navigation/navigationRef';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  scheduleWeeklySummary,
  cancelWeeklySummary,
  registerPushToken,
  syncProfileLang,
} from '../notifications';

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const statementId = response.notification.request.content.data?.statementId;
  if (typeof statementId === 'string') navigateToStatementReview(statementId);
}

export function NotificationsSync() {
  const { reminder, weekly, notifyNew, loaded: settingsLoaded } = useAppSettings();
  const { cards, isDemo, loaded: cardsLoaded } = useCards();
  const { session } = useAuth();
  const { lang } = useLocale();

  // The server sends its own push notifications (statement received/parsed/
  // saved) without ever seeing this device's language setting — keep the
  // profile's copy in sync so those messages land in the right language.
  useEffect(() => {
    if (session?.user.id) {
      syncProfileLang(session.user.id, lang);
    }
  }, [lang, session?.user.id]);

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

  // Tapping a "statement ready to review" push should jump straight to that
  // statement's review screen — both for a tap while the app is running and
  // for a cold start launched by tapping the notification.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => sub.remove();
  }, []);

  return null;
}
