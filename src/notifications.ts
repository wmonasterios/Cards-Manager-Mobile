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

// Read-only check used by the automatic scheduling below — it must never be
// the thing that pops the native OS prompt. Only an explicit tap (the
// notifications explainer screen, or flipping a toggle in Settings) does
// that, via requestNotificationPermission above.
async function hasNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
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

// Cancels every payment reminder the OS has queued for this app, found by its
// data.type — not just the ids we last stored. Overlapping schedule runs used
// to orphan reminders whose ids were never saved, so they piled up and all
// fired together (Oct 2026). Scanning by type also cleans up those leftovers.
async function cancelAllPaymentReminders() {
  await cancelAndClear(REMINDER_IDS_KEY);
  try {
    const queued = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      queued
        .filter((n) => n.content.data?.type === 'payment_reminder')
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch {
    // Best-effort — the stored-id cancel above already ran.
  }
}

// Every schedule/cancel goes through this queue, so a run never starts while
// another is still between its cancel and its new schedules.
let reminderQueue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  reminderQueue = reminderQueue.then(task, task).catch(() => {});
  return reminderQueue;
}

export function cancelPaymentReminders(): Promise<void> {
  return enqueue(cancelAllPaymentReminders);
}

export function schedulePaymentReminders(cards: DecoratedCard[], lang: Lang = 'en'): Promise<void> {
  return enqueue(() => doSchedulePaymentReminders(cards, lang));
}

// No amounts: notifications show on the lock screen (brand rule, Oct 2026).
function reminderText(lang: Lang, name: string, kind: string) {
  if (lang === 'es') {
    return {
      title:
        kind === 'full'
          ? `${name}: pago total vence en 3 días`
          : kind === 'min'
            ? `${name}: pago mínimo vence en 3 días`
            : `Tu ${name} vence en 3 días`,
      body: 'Toca para ver el detalle.',
    };
  }
  return {
    title:
      kind === 'full'
        ? `${name} full payment due in 3 days`
        : kind === 'min'
          ? `${name} minimum due in 3 days`
          : `Your ${name} is due in 3 days`,
    body: 'Tap to see the details.',
  };
}

async function doSchedulePaymentReminders(cards: DecoratedCard[], lang: Lang) {
  await cancelAllPaymentReminders();
  const granted = await hasNotificationPermission();
  if (!granted) return;

  const ids: string[] = [];
  // One reminder per pending deadline: a single one when the bank uses one
  // date, or one for the minimum and one for the full payment when they differ.
  for (const card of cards) {
    if (card.paid) continue;
    for (const ev of card.payEvents) {
      if (ev.settled) continue;
      const due = new Date(ev.iso + 'T09:00:00');
      const fireAt = new Date(due.getTime() - 3 * 24 * 60 * 60 * 1000);
      if (fireAt.getTime() <= Date.now()) continue;
      const text = reminderText(lang, card.displayName, ev.kind);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          ...text,
          data: { cardId: card.id, type: 'payment_reminder' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
      ids.push(id);
    }
  }
  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
}

export async function cancelWeeklySummary() {
  await cancelAndClear(WEEKLY_ID_KEY);
}

export async function scheduleWeeklySummary(lang: Lang = 'en') {
  await cancelAndClear(WEEKLY_ID_KEY);
  const granted = await hasNotificationPermission();
  if (!granted) return;

  const id = await Notifications.scheduleNotificationAsync({
    content:
      lang === 'es'
        ? {
            title: 'Tu resumen semanal está listo',
            body: 'Abre Poquet para ver tus gastos de la semana y tus próximos pagos.',
          }
        : {
            title: 'Your weekly summary is ready',
            body: 'Open Poquet to see this week’s spending and upcoming due dates.',
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

export async function syncPushPrefs(userId: string, reminders: boolean, updates: boolean): Promise<void> {
  try {
    await supabase.from('profiles').update({ push_reminders: reminders, push_updates: updates }).eq('id', userId);
  } catch {
    // Best-effort — worst case the server keeps the previous choice until next launch.
  }
}

export async function registerPushToken(userId: string): Promise<void> {
  const granted = await hasNotificationPermission();
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
