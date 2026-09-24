import React, { createContext, useContext, useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { CARDS, Card, Category, DEMO_REVIEW_COUNTS } from '../data';
import { decorateCard, DecoratedCard, Payment } from '../decorate';
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
  updateTransactionCategory,
} from '../supabase/cardsApi';
import { listNeedsReviewStatements } from '../supabase/statementsApi';
import { DbCard, DbTransaction, DbStatement, NewDbCard } from '../supabase/types';

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
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
  updateCardDisplay: (id: string, patch: { nickname: string | null; colorKey: string | null; bank: string }) => void;
  updateTxCategory: (txId: string, merchant: string, category: Category, applyToAllWithMerchant: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

const CardsContext = createContext<CardsContextValue | null>(null);

export function CardsProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const isDemo = !session;
  const userId = session?.user.id;

  // Demo mode: the mock catalogue, with paid/payment overlays kept on-device.
  const [demoPaid, setDemoPaid, demoPaidLoaded] = usePersistedState<Record<string, boolean>>('cards.paid', {});
  const [demoPayments, setDemoPayments, demoPaymentsLoaded] = usePersistedState<Record<string, Payment[]>>(
    'cards.payments',
    {},
  );

  // Real mode: cards, payments and transactions the signed-in user owns in Supabase.
  const [dbCards, setDbCards] = useState<DbCard[]>([]);
  const [dbPayments, setDbPayments] = useState<Record<string, Payment[]>>({});
  const [dbTransactions, setDbTransactions] = useState<DbTransaction[]>([]);
  const [dbStatements, setDbStatements] = useState<DbStatement[]>([]);
  const [realLoaded, setRealLoaded] = useState(false);
  // Distinguishes "we checked and you genuinely have zero cards" from "the
  // fetch failed" — without this, a network hiccup on someone's very first
  // load (nothing cached yet) looked identical to an empty account.
  const [loadError, setLoadError] = useState(false);

  const t = useT();
  const colors = useColors();

  const loadReal = useCallback(async () => {
    if (!userId) return;
    try {
      const [cardsRows, paymentsRows, transactionRows, statementRows] = await Promise.all([
        listCards(userId),
        listPayments(userId),
        listTransactions(userId),
        listNeedsReviewStatements(userId),
      ]);
      setDbCards(cardsRows);
      setDbTransactions(transactionRows);
      setDbStatements(statementRows);
      const byCard: Record<string, Payment[]> = {};
      for (const p of paymentsRows) {
        const list = byCard[p.card_id] ?? (byCard[p.card_id] = []);
        list.push({ amount: Number(p.amount), when: p.note || shortDate(p.paid_on) });
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

  const baseCards: Card[] = useMemo(
    () => (isDemo ? CARDS : dbCards.map((c) => dbCardToCard(c, dbTransactions))),
    [isDemo, dbCards, dbTransactions],
  );

  const paidMap = useMemo(
    () => (isDemo ? demoPaid : Object.fromEntries(dbCards.map((c) => [c.id, c.paid_this_cycle]))),
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
        setDemoPaid((prev) => ({ ...prev, [id]: !(prev[id] ?? CARDS.find((c) => c.id === id)?.balance === 0) }));
        return;
      }
      const current = dbCards.find((c) => c.id === id);
      if (!current) return;
      const next = !current.paid_this_cycle;
      setDbCards((prev) => prev.map((c) => (c.id === id ? { ...c, paid_this_cycle: next } : c)));
      updateCard(id, { paid_this_cycle: next }).catch(() => loadReal());
    },
    [isDemo, dbCards, setDemoPaid, loadReal],
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
      await updateTransactionCategory(userId, txId, merchant, category, applyToAllWithMerchant);
      await loadReal();
    },
    [isDemo, userId, loadReal],
  );

  const value = useMemo(
    () => ({
      cards,
      getCard,
      togglePaid,
      addPayment,
      paymentHistory,
      loaded: authLoading ? false : isDemo ? demoPaidLoaded && demoPaymentsLoaded : realLoaded,
      loadError: isDemo ? false : loadError,
      isDemo,
      addRealCard,
      deleteCard,
      updateCardDisplay,
      updateTxCategory,
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
      realLoaded,
      loadError,
      addRealCard,
      deleteCard,
      updateCardDisplay,
      updateTxCategory,
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
