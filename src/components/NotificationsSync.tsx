import { useEffect } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  scheduleWeeklySummary,
  cancelWeeklySummary,
  registerPushToken,
  syncProfileLang,
} from '../notifications';

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

  return null;
}
