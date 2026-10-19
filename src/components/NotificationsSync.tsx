import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAppSettings } from '../context/AppSettingsContext';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import {
  navigateToStatementReview,
  navigateToStatementDetail,
  navigateToStatements,
  navigateToCardDetail,
  navigateToNotifPrimer,
  navigateToAdvisor,
  navigateToHome,
} from '../navigation/navigationRef';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  scheduleWeeklySummary,
  cancelWeeklySummary,
  registerPushToken,
  syncProfileLang,
  syncPushPrefs,
} from '../notifications';

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data ?? {};
  const statementId = data.statementId;
  const cardId = data.cardId;
  switch (data.type) {
    case 'statement_ready':
      if (typeof statementId === 'string') navigateToStatementReview(statementId);
      return;
    case 'reread_ready':
      if (typeof statementId === 'string') navigateToStatementDetail(statementId);
      return;
    case 'statement_received':
    case 'gmail_forwarding_code':
      navigateToStatements();
      return;
    case 'payment_reminder':
      if (typeof cardId === 'string') navigateToCardDetail(cardId);
      return;
    case 'journey':
      // Server nudges (push-journey edge function) say where to land.
      if (data.screen === 'card' && typeof cardId === 'string') navigateToCardDetail(cardId);
      else if (data.screen === 'advisor') navigateToAdvisor();
      else if (data.screen === 'home') navigateToHome();
      else navigateToStatements();
      return;
    default:
      // Older/unknown payloads: fall back to whichever id is present.
      if (typeof statementId === 'string') navigateToStatementReview(statementId);
      else if (typeof cardId === 'string') navigateToCardDetail(cardId);
  }
}

export function NotificationsSync() {
  const { reminder, weekly, notifyNew, notifPrimerSeen, completeNotifPrimer, loaded: settingsLoaded } =
    useAppSettings();
  const { cards, isDemo, loaded: cardsLoaded } = useCards();
  const { session } = useAuth();
  const { lang } = useLocale();
  const primerAsked = useRef(false);

  // The server sends its own push notifications (statement received/parsed/
  // saved) without ever seeing this device's language setting — keep the
  // profile's copy in sync so those messages land in the right language.
  useEffect(() => {
    if (session?.user.id) {
      syncProfileLang(session.user.id, lang);
    }
  }, [lang, session?.user.id]);

  // Default-on preferences (reminders, new-statement pushes) must never
  // silently trigger the native OS permission dialog on first sign-in —
  // that's what the explainer screen is for. Only once the account has gone
  // through it (enabled or declined) do the effects below actually ask.
  useEffect(() => {
    if (!settingsLoaded || isDemo || !session || notifPrimerSeen || primerAsked.current) return;
    primerAsked.current = true;
    Notifications.getPermissionsAsync().then((current) => {
      if (current.status === 'undetermined') {
        navigateToNotifPrimer();
      } else {
        // Already decided at the OS level from a previous install — nothing to prime.
        completeNotifPrimer();
      }
    });
  }, [settingsLoaded, isDemo, session, notifPrimerSeen, completeNotifPrimer]);

  useEffect(() => {
    if (!settingsLoaded || !cardsLoaded || isDemo || !notifPrimerSeen) return;
    if (reminder) {
      schedulePaymentReminders(cards, lang);
    } else {
      cancelPaymentReminders();
    }
  }, [reminder, cards, lang, isDemo, settingsLoaded, cardsLoaded, notifPrimerSeen]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (weekly) {
      scheduleWeeklySummary(lang);
    } else {
      cancelWeeklySummary();
    }
  }, [weekly, lang, settingsLoaded]);

  // The server's journey / due-day pushes respect these two toggles, so it
  // needs its own copy of them (push-journey reads profiles.push_*).
  useEffect(() => {
    if (!settingsLoaded || isDemo || !session?.user.id) return;
    syncPushPrefs(session.user.id, reminder, notifyNew);
  }, [settingsLoaded, isDemo, session?.user.id, reminder, notifyNew]);

  useEffect(() => {
    if (notifyNew && notifPrimerSeen && session?.user.id) {
      registerPushToken(session.user.id);
    }
  }, [notifyNew, notifPrimerSeen, session?.user.id]);

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
