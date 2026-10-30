import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { supabase } from './supabase/client';

// First-party product analytics (owner's call, 27 Oct 2026): what people see
// and leave half done, written to public.app_events (migration
// 20261027_app_events.sql; insert-only from the app, nobody reads it from
// here). Whatever the database already knows — statements, advisor
// questions, cards, pushes — isn't tracked again.
//
// Every event and its props are listed in EventProps, so nothing outside the
// list can be sent: never amounts, merchants, banks, last4 or text the user
// typed. Names follow PostHog's style; moving there later means changing
// `send` only.
//
// Signed out (onboarding, auth, the demo) only the pre-auth events go out,
// with the device's anon_id; the database refuses any other. Events are
// queued and sent in batches, never blocking the UI, and dropped silently on
// failure.

export type StatementsFrom = 'home_plus' | 'tab' | 'card_detail' | 'home_card_cta' | 'settings' | 'push';
export type TransactionsFrom = 'home_search' | 'insights' | 'card_detail' | 'card_member';

type EventProps = {
  // Sign-in and entry (sent signed out too)
  onboarding_viewed: { step: number };
  auth_viewed: { mode: 'signup' | 'signin' };
  signup_started: { method: 'email' | 'google' | 'apple' };
  signup_failed: { method: 'email' | 'google' | 'apple'; reason: string };
  demo_entered: Record<string, never>;
  demo_exited: { exit_to: 'signup' | 'close' };
  security_setup_done: { choice: 'faceid' | 'pin' | 'skipped' };
  // Towards the first statement
  statements_viewed: { from: StatementsFrom; has_cards: boolean };
  upload_started: Record<string, never>;
  upload_canceled: Record<string, never>;
  forwarding_guide_opened: { action: 'guide' | 'copy' };
  review_abandoned: { seconds: number };
  fwd_card_action: { status: string; action: 'confirm' | 'copy' | 'support' | 'dismiss' };
  // Advisor
  advisor_viewed: { mode: 'consent' | 'chat' | 'limit' | 'off' };
  advisor_consent_declined: Record<string, never>;
  advisor_limit_hit: { limit: 'daily' | 'monthly' };
  // Insights
  insights_viewed: { months_with_data: number; currencies: number };
  insights_month_changed: { direction: 'back' | 'forward' };
  insights_week_selected: Record<string, never>;
  insights_category_selected: { category: string; via: 'donut' | 'list' };
  insights_filter_changed: { filter: 'currency' | 'holder' | 'card' };
  insights_more_opened: { what: 'categories' | 'transactions' };
  insights_tx_opened: Record<string, never>;
  // General use
  app_opened: { cold: boolean };
  screen_viewed: { screen: 'home' | 'calendar' | 'insights' };
  transactions_viewed: { from: TransactionsFrom };
};

export type AnalyticsEvent = keyof EventProps;

// Mirrors the anon insert policy in the migration.
const PRE_AUTH: ReadonlySet<AnalyticsEvent> = new Set([
  'onboarding_viewed',
  'auth_viewed',
  'signup_started',
  'signup_failed',
  'demo_entered',
  'demo_exited',
]);

const ANON_KEY = 'cardsManager:analyticsAnonId';
const FLUSH_MS = 10_000;
const MAX_QUEUE = 100;

type Row = { anon_id: string; event: string; props: object; app_version: string | null; platform: string };

let signedIn = false;
let anonId: string | null = null;
let queue: Omit<Row, 'anon_id'>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function randomUuid(): string {
  // RFC 4122 v4 from Math.random: enough for an analytics device id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getAnonId(): Promise<string> {
  if (anonId) return anonId;
  try {
    const saved = await AsyncStorage.getItem(ANON_KEY);
    if (saved) return (anonId = saved);
  } catch {
    // Storage unavailable: a per-session id still lets a session be counted.
  }
  anonId = randomUuid();
  AsyncStorage.setItem(ANON_KEY, anonId).catch(() => {});
  return anonId;
}

// Set by AnalyticsSync whenever the session changes.
export function setAnalyticsSignedIn(value: boolean) {
  signedIn = value;
}

export function track<E extends AnalyticsEvent>(
  event: E,
  ...[props]: EventProps[E] extends Record<string, never> ? [] : [EventProps[E]]
) {
  if (__DEV__ && process.env.EXPO_PUBLIC_TRACK_IN_DEV !== '1') return;
  if (!signedIn && !PRE_AUTH.has(event)) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({
    event,
    props: props ?? {},
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
  });
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}

export async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    const id = await getAnonId();
    // Rows were queued under the session state they were tracked in; one the
    // database would refuse (a signed-in event after signing out) just fails
    // the batch, which is dropped — analytics never retries or blocks.
    await send(batch.map((r) => ({ ...r, anon_id: id })));
  } catch {
    // Dropped.
  } finally {
    flushing = false;
  }
}

async function send(rows: Row[]) {
  await supabase.from('app_events').insert(rows);
}

// Send what's queued when the app goes to the background, so short sessions
// still count.
AppState.addEventListener('change', (state) => {
  if (state !== 'active') void flush();
});
