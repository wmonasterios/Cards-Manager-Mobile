import React, { createContext, useContext, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildDemoCards, Card, Category, DEMO_PAID_DEFAULTS, DEMO_REVIEW_COUNTS } from '../data';
import { decorateCard, DecoratedCard, Payment } from '../decorate';
import { buildWorstCaseCards, demoDataset } from '../worstCase';
import { useT } from '../i18n/LocaleContext';
import { useColors } from '../theme/ThemeContext';
import { usePersistedState } from '../storage/usePersistedState';
import { useAuth } from './AuthContext';
import {
  listCards,
  listPayments,
  listTransactions,
  createCard,
  updateCard,
  addPaymentRow,
  dbCardToCard,
  deleteCardCompletely,
  deleteAllUserData,
  updateTransactionCategory,
  setTransactionExcluded as setTransactionExcludedApi,
  reorderCards as reorderCardsApi,
  patchTransactionRows,
  TxPatch,
  listCardMembers,
  saveCardMember,
} from '../supabase/cardsApi';
import { listNeedsReviewStatements } from '../supabase/statementsApi';
import { supabase, isAuthError } from '../supabase/client';
import { DbCard, DbCardMember, DbTransaction, DbStatement, NewDbCard } from '../supabase/types';

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

// A category change made while offline is applied locally right away, then
// queued here for a real attempt the next time loadReal() runs with
// connectivity — otherwise it would just silently revert on the next
// successful refresh, since refreshing only re-fetches, it doesn't replay
// what never reached the server.
const CATEGORY_QUEUE_KEY = 'cardsManager:queue:categoryChanges';
type PendingCategoryChange = { txId: string; merchant: string; category: Category; applyToAllWithMerchant: boolean };

async function readCategoryQueue(): Promise<PendingCategoryChange[]> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORY_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeCategoryQueue(queue: PendingCategoryChange[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CATEGORY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort — worst case the change is only ever applied locally.
  }
}

type CardsContextValue = {
  cards: DecoratedCard[];
  getCard: (id: string) => DecoratedCard | undefined;
  togglePaid: (id: string) => void;
  addPayment: (id: string, amount: number, when: string, paidOnIso?: string) => void;
  paymentHistory: (id: string) => Payment[];
  loaded: boolean;
  loadError: boolean;
  isDemo: boolean;
  addRealCard: (input: NewDbCard) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  deleteAllData: () => Promise<void>;
  updateCardDisplay: (id: string, patch: { nickname: string | null; colorKey: string | null; bank: string }) => void;
  updateTxCategory: (txId: string, merchant: string, category: Category, applyToAllWithMerchant: boolean) => Promise<void>;
  setTxExcluded: (txId: string, excluded: boolean) => void;
  patchTxs: (patches: { id: string; patch: TxPatch }[]) => Promise<void>;
  reorderCards: (orderedIds: string[]) => void;
  // Additional cards: every answer the user gave (to know which numbers were
  // already asked about), and how to change one.
  cardMembers: DbCardMember[];
  setCardMember: (cardId: string, last4: string, kind: 'principal' | 'additional', name?: string | null) => Promise<void>;
  refresh: () => Promise<void>;
};

const CardsContext = createContext<CardsContextValue | null>(null);

export function CardsProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !session;
  const userId = session?.user.id;

  // Demo mode: the mock catalogue, with paid/payment overlays kept on-device.
  // .v2 keys (Oct 2026): the demo catalogue changed shape (Davibank removed,
  // dates re-anchored to today), so earlier demo taps must not leak into it.
  const [demoPaid, setDemoPaid, demoPaidLoaded] = usePersistedState<Record<string, boolean>>('cards.paid.v2', {});
  const [demoPayments, setDemoPayments, demoPaymentsLoaded] = usePersistedState<Record<string, Payment[]>>(
    'cards.payments.v2',
    {},
  );
  const [demoOrder, setDemoOrder, demoOrderLoaded] = usePersistedState<string[]>('cards.order.v2', []);

  // Real mode: cards, payments and transactions the signed-in user owns in Supabase.
  const [dbCards, setDbCards] = useState<DbCard[]>([]);
  const [dbPayments, setDbPayments] = useState<Record<string, Payment[]>>({});
  const [dbTransactions, setDbTransactions] = useState<DbTransaction[]>([]);
  const [dbStatements, setDbStatements] = useState<DbStatement[]>([]);
  const [dbMembers, setDbMembers] = useState<DbCardMember[]>([]);
  const [realLoaded, setRealLoaded] = useState(false);
  // Distinguishes "we checked and you genuinely have zero cards" from "the
  // fetch failed" — without this, a network hiccup on someone's very first
  // load (nothing cached yet) looked identical to an empty account.
  const [loadError, setLoadError] = useState(false);

  const t = useT();
  const colors = useColors();

  const loadReal = useCallback(async () => {
    if (!userId) return;
    // Try to actually persist anything queued from an offline edit before
    // pulling fresh data — if this fails too, it just stays queued.
    const queue = await readCategoryQueue();
    if (queue.length > 0) {
      const stillPending: PendingCategoryChange[] = [];
      for (const op of queue) {
        try {
          await updateTransactionCategory(userId, op.txId, op.merchant, op.category, op.applyToAllWithMerchant);
        } catch {
          stillPending.push(op);
        }
      }
      await writeCategoryQueue(stillPending);
    }
    // One failed request used to land straight on "No pudimos cargar tus
    // tarjetas · Reintentar". Retry twice first (after 1 s and 3 s; the
    // skeleton stays up meanwhile), and when the failure is the session,
    // refresh it before the next try. Only a failure that survives all three
    // shows the error.
    const fetchAll = () =>
      Promise.all([
        listCards(userId),
        listPayments(userId),
        listTransactions(userId),
        listNeedsReviewStatements(userId),
        // Additional cards are a nice-to-have: never fail the whole load over them.
        listCardMembers(userId).catch(() => null),
      ]);
    const RETRY_DELAYS_MS = [1000, 3000];
    const fetchWithRetry = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetchAll();
        } catch (e) {
          if (attempt >= RETRY_DELAYS_MS.length) throw e;
          if (isAuthError(e)) await supabase.auth.refreshSession().catch(() => {});
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
      }
    };
    try {
      const [cardsRows, paymentsRows, transactionRows, statementRows, memberRows] = await fetchWithRetry();
      setDbCards(cardsRows);
      if (memberRows) setDbMembers(memberRows);
      setDbTransactions(transactionRows);
      setDbStatements(statementRows);
      const byCard: Record<string, Payment[]> = {};
      for (const p of paymentsRows) {
        const list = byCard[p.card_id] ?? (byCard[p.card_id] = []);
        list.push({ amount: Number(p.amount), when: p.note || shortDate(p.paid_on), paidOnIso: p.paid_on });
      }
      setDbPayments(byCard);
      setLoadError(false);
    } catch {
      // A failed refresh should never blank out data already on screen — leave the
      // previous cards/payments/transactions as-is so a transient network hiccup
      // doesn't look like the user's cards were deleted. loadError still flips so
      // the UI can tell a real failure apart from a genuinely empty account.
      setLoadError(true);
    } finally {
      setRealLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setRealLoaded(false);
      loadReal();
    } else {
      setDbCards([]);
      setDbPayments({});
      setDbTransactions([]);
      setDbStatements([]);
      setDbMembers([]);
      setRealLoaded(false);
    }
  }, [userId, loadReal]);

  // Re-sync whenever the app comes back to the foreground, so a stale or failed
  // background refresh never leaves the screen showing outdated data.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active' && userId) {
        loadReal();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [userId, loadReal]);

  // Demo mode has no server-side sort_order to persist a drag-reorder into,
  // so the chosen order is kept on-device as a list of ids — anything not in
  // it (new to the catalogue, or not yet reordered) just keeps its original
  // relative order at the end.
  // The demo catalogue is re-anchored to today (see buildDemoCards), so it's
  // rebuilt whenever the calendar day changes.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const demoCards = useMemo(() => {
    const cards = buildDemoCards(todayIso);
    // Dev-only stress data (src/worstCase.ts); __DEV__ is false in every OTA/store bundle.
    const which = __DEV__ ? demoDataset() : 'demo';
    return which === 'demo' ? cards : buildWorstCaseCards(cards, which);
  }, [todayIso]);

  const baseCards: Card[] = useMemo(() => {
    if (!isDemo) return dbCards.map((c) => dbCardToCard(c, dbTransactions, dbMembers));
    if (demoOrder.length === 0) return demoCards;
    const byId = new Map(demoCards.map((c) => [c.id, c]));
    const ordered = demoOrder.map((id) => byId.get(id)).filter((c): c is Card => !!c);
    const remaining = demoCards.filter((c) => !demoOrder.includes(c.id));
    return [...ordered, ...remaining];
  }, [isDemo, dbCards, dbTransactions, dbMembers, demoOrder, demoCards]);

  const paidMap = useMemo(
    () => (isDemo ? { ...DEMO_PAID_DEFAULTS, ...demoPaid } : Object.fromEntries(dbCards.map((c) => [c.id, c.paid_this_cycle]))),
    [isDemo, demoPaid, dbCards],
  );
  const paymentsMap = isDemo ? demoPayments : dbPayments;

  // How many of each card's statements are stuck in needs_review — feeds the
  // Home screen's "Needs attention" list without re-querying per card.
  const reviewCounts = useMemo(() => {
    if (isDemo) return DEMO_REVIEW_COUNTS;
    const map: Record<string, number> = {};
    for (const s of dbStatements) {
      if (s.status === 'needs_review' && s.card_id) {
        map[s.card_id] = (map[s.card_id] ?? 0) + 1;
      }
    }
    return map;
  }, [isDemo, dbStatements]);

  const cards = useMemo(
    () =>
      baseCards.map((c) =>
        decorateCard(c, paidMap[c.id], paymentsMap[c.id] ?? [], t, colors, reviewCounts[c.id] ?? 0),
      ),
    [baseCards, paidMap, paymentsMap, t, colors, reviewCounts],
  );

  const getCard = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  const togglePaid = useCallback(
    (id: string) => {
      if (isDemo) {
        setDemoPaid((prev) => ({
          ...prev,
          [id]: !(prev[id] ?? DEMO_PAID_DEFAULTS[id] ?? demoCards.find((c) => c.id === id)?.balance === 0),
        }));
        return;
      }
      const current = dbCards.find((c) => c.id === id);
      if (!current) return;
      const next = !current.paid_this_cycle;
      setDbCards((prev) => prev.map((c) => (c.id === id ? { ...c, paid_this_cycle: next } : c)));
      updateCard(id, { paid_this_cycle: next }).catch(() => loadReal());
    },
    [isDemo, dbCards, setDemoPaid, loadReal, demoCards],
  );

  const addPayment = useCallback(
    (id: string, amount: number, when: string, paidOnIso?: string) => {
      if (isDemo) {
        setDemoPayments((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), { amount, when }] }));
        // Compare against what's left right now (already net of prior payments
        // this cycle), not the card's original balance, or a second/third
        // partial payment that finally covers it never gets marked paid.
        const current = cards.find((c) => c.id === id);
        if (current && amount >= current.remaining - 0.01) {
          setDemoPaid((prev) => ({ ...prev, [id]: true }));
        }
        return;
      }
      if (!userId) return;
      const paidOn = paidOnIso ?? new Date().toISOString().slice(0, 10);
      const current = cards.find((c) => c.id === id);
      const coversBalance = !!current && amount >= current.remaining - 0.01;
      addPaymentRow(userId, id, amount, paidOn, when)
        .then(() => (coversBalance ? updateCard(id, { paid_this_cycle: true }) : undefined))
        .then(loadReal);
    },
    [isDemo, setDemoPayments, setDemoPaid, userId, loadReal, cards],
  );

  const paymentHistory = useCallback((id: string) => paymentsMap[id] ?? [], [paymentsMap]);

  const addRealCard = useCallback(
    async (input: NewDbCard) => {
      if (!userId) return;
      await createCard(userId, input);
      await loadReal();
    },
    [userId, loadReal],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      if (isDemo) return;
      await deleteCardCompletely(id);
      await loadReal();
    },
    [isDemo, loadReal],
  );

  const deleteAllData = useCallback(async () => {
    if (isDemo || !userId) return;
    await deleteAllUserData(userId);
    await loadReal();
  }, [isDemo, userId, loadReal]);

  // Pure display preferences — never touched by statement parsing/applying.
  // (bank is included here because, unlike product/network, apply-statement
  // never overwrites it on an existing card — only sets it once at creation.)
  const updateCardDisplay = useCallback(
    (id: string, patch: { nickname: string | null; colorKey: string | null; bank: string }) => {
      if (isDemo) return;
      setDbCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, nickname: patch.nickname, color_key: patch.colorKey, bank: patch.bank } : c)),
      );
      updateCard(id, { nickname: patch.nickname, color_key: patch.colorKey, bank: patch.bank }).catch(() => loadReal());
    },
    [isDemo, loadReal],
  );

  const updateTxCategory = useCallback(
    async (txId: string, merchant: string, category: Category, applyToAllWithMerchant: boolean) => {
      if (isDemo || !userId) return;
      // Applied locally right away regardless of connectivity — the merchant
      // match here is a same-name exact match, a reasonable immediate
      // approximation of the server's own chain-matching RPC, which still
      // runs for real (with its fuller logic) once the write actually goes
      // through, live or via the retry queue.
      setDbTransactions((prev) =>
        prev.map((t) =>
          t.id === txId || (applyToAllWithMerchant && t.merchant === merchant)
            ? { ...t, category, category_source: 'manual' }
            : t,
        ),
      );
      try {
        await updateTransactionCategory(userId, txId, merchant, category, applyToAllWithMerchant);
        await loadReal();
      } catch {
        const queue = await readCategoryQueue();
        queue.push({ txId, merchant, category, applyToAllWithMerchant });
        await writeCategoryQueue(queue);
      }
    },
    [isDemo, userId, loadReal],
  );

  const setTxExcluded = useCallback(
    (txId: string, excluded: boolean) => {
      if (isDemo) return;
      setDbTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, excluded_from_spend: excluded } : t)));
      setTransactionExcludedApi(txId, excluded).catch(() => loadReal());
    },
    [isDemo, loadReal],
  );

  const setCardMember = useCallback(
    async (cardId: string, last4: string, kind: 'principal' | 'additional', name?: string | null) => {
      if (isDemo || !userId) return;
      const row = await saveCardMember(userId, cardId, last4, kind, name);
      setDbMembers((prev) => [...prev.filter((m) => !(m.card_id === cardId && m.last4 === last4)), row]);
    },
    [isDemo, userId],
  );

  const patchTxs = useCallback(
    async (patches: { id: string; patch: TxPatch }[]) => {
      if (isDemo || patches.length === 0) return;
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      setDbTransactions((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id)! } : t)));
      try {
        await patchTransactionRows(patches);
      } catch (e) {
        await loadReal();
        throw e;
      }
    },
    [isDemo, loadReal],
  );

  const reorderCards = useCallback(
    (orderedIds: string[]) => {
      if (isDemo) {
        setDemoOrder(orderedIds);
        return;
      }
      // Optimistic: reflect the new order immediately, then persist. A failed
      // write falls back to whatever the server actually has, rather than
      // leaving the screen showing an order that never saved.
      setDbCards((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        const reordered = orderedIds.map((id) => byId.get(id)).filter((c): c is DbCard => !!c);
        return reordered.length === prev.length ? reordered : prev;
      });
      reorderCardsApi(orderedIds).catch(() => loadReal());
    },
    [isDemo, setDemoOrder, loadReal],
  );

  const value = useMemo(
    () => ({
      cards,
      getCard,
      togglePaid,
      addPayment,
      paymentHistory,
      loaded: authLoading ? false : isDemo ? demoPaidLoaded && demoPaymentsLoaded && demoOrderLoaded : realLoaded,
      loadError: isDemo ? false : loadError,
      isDemo,
      addRealCard,
      deleteCard,
      deleteAllData,
      updateCardDisplay,
      updateTxCategory,
      setTxExcluded,
      patchTxs,
      reorderCards,
      cardMembers: isDemo ? [] : dbMembers,
      setCardMember,
      refresh: loadReal,
    }),
    [
      cards,
      getCard,
      togglePaid,
      addPayment,
      paymentHistory,
      authLoading,
      isDemo,
      demoPaidLoaded,
      demoPaymentsLoaded,
      demoOrderLoaded,
      realLoaded,
      loadError,
      addRealCard,
      deleteCard,
      deleteAllData,
      updateCardDisplay,
      updateTxCategory,
      setTxExcluded,
      patchTxs,
      reorderCards,
      dbMembers,
      setCardMember,
      loadReal,
    ],
  );

  return <CardsContext.Provider value={value}>{children}</CardsContext.Provider>;
}

export function useCards() {
  const ctx = useContext(CardsContext);
  if (!ctx) throw new Error('useCards must be used within CardsProvider');
  return ctx;
}
