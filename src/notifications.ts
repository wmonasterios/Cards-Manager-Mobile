import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DecoratedCard } from './decorate';
import { supabase } from './supabase/client';
import { Lang } from './i18n/dict';

const REMINDER_IDS_KEY = 'cardsManager:notif:reminderIds';
const WEEKLY_ID_KEY = 'cardsManager:notif:weeklyId';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.granted;
}

async function readIds(key: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function cancelAndClear(key: string) {
  const ids = await readIds(key);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  await AsyncStorage.removeItem(key);
}

export async function cancelPaymentReminders() {
  await cancelAndClear(REMINDER_IDS_KEY);
}

export async function schedulePaymentReminders(cards: DecoratedCard[]) {
  await cancelAndClear(REMINDER_IDS_KEY);
  const granted = await requestNotificationPermission();
  if (!granted) return;

  const ids: string[] = [];
  for (const card of cards) {
    if (card.paid || !card.dueIso) continue;
    const due = new Date(card.dueIso + 'T09:00:00');
    const fireAt = new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000);
    if (fireAt.getTime() <= Date.now()) continue;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${card.displayName} due in 3 days`,
        body: `${card.balanceText} · minimum ${card.minText}`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    ids.push(id);
  }
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
}

export async function cancelWeeklySummary() {
  await cancelAndClear(WEEKLY_ID_KEY);
}

export async function scheduleWeeklySummary() {
  await cancelAndClear(WEEKLY_ID_KEY);
  const granted = await requestNotificationPermission();
  if (!granted) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your weekly summary is ready',
      body: 'Open Cards Manager to see this week’s spending and upcoming due dates.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // Sunday
      hour: 18,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(WEEKLY_ID_KEY, JSON.stringify([id]));
}

export async function syncProfileLang(userId: string, lang: Lang): Promise<void> {
  try {
    await supabase.from('profiles').update({ lang }).eq('id', userId);
  } catch {
    // Best-effort — worst case, server-sent notifications fall back to English.
  }
}

export async function registerPushToken(userId: string): Promise<void> {
  const granted = await requestNotificationPermission();
  if (!granted) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('profiles').update({ push_token: data }).eq('id', userId);
  } catch {
    // Push tokens are best-effort — a failure here shouldn't block anything else.
  }
}
