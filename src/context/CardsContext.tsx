import React, { createContext, useContext, useMemo, useCallback, useState, useEffect } from 'react';
import { CARDS, Card } from '../data';
import { decorateCard, DecoratedCard, Payment } from '../decorate';
import { useT } from '../i18n/LocaleContext';
import { useColors } from '../theme/ThemeContext';
import { usePersistedState } from '../storage/usePersistedState';
import { useAuth } from './AuthContext';
import { listCards, listPayments, createCard, updateCard, addPaymentRow, dbCardToCard } from '../supabase/cardsApi';
import { DbCard, NewDbCard } from '../supabase/types';

function shortDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
}

type CardsContextValue = {
  cards: DecoratedCard[];
  getCard: (id: string) => DecoratedCard | undefined;
  togglePaid: (id: string) => void;
  addPayment: (id: string, amount: number, when: string) => void;
  paymentHistory: (id: string) => Payment[];
  loaded: boolean;
  isDemo: boolean;
  addRealCard: (input: NewDbCard) => Promise<void>;
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

  // Real mode: cards and payments the signed-in user owns in Supabase.
  const [dbCards, setDbCards] = useState<DbCard[]>([]);
  const [dbPayments, setDbPayments] = useState<Record<string, Payment[]>>({});
  const [realLoaded, setRealLoaded] = useState(false);

  const t = useT();
  const colors = useColors();

  const loadReal = useCallback(async () => {
    if (!userId) return;
    try {
      const [cardsRows, paymentsRows] = await Promise.all([listCards(userId), listPayments(userId)]);
      setDbCards(cardsRows);
      const byCard: Record<string, Payment[]> = {};
      for (const p of paymentsRows) {
        const list = byCard[p.card_id] ?? (byCard[p.card_id] = []);
        list.push({ amount: Number(p.amount), when: p.note || shortDate(p.paid_on) });
      }
      setDbPayments(byCard);
    } catch {
      setDbCards([]);
      setDbPayments({});
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
      setRealLoaded(false);
    }
  }, [userId, loadReal]);

  const baseCards: Card[] = useMemo(
    () => (isDemo ? CARDS : dbCards.map(dbCardToCard)),
    [isDemo, dbCards],
  );

  const paidMap = useMemo(
    () => (isDemo ? demoPaid : Object.fromEntries(dbCards.map((c) => [c.id, c.paid_this_cycle]))),
    [isDemo, demoPaid, dbCards],
  );
  const paymentsMap = isDemo ? demoPayments : dbPayments;

  const cards = useMemo(
    () => baseCards.map((c) => decorateCard(c, paidMap[c.id], paymentsMap[c.id] ?? [], t, colors)),
    [baseCards, paidMap, paymentsMap, t, colors],
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
    (id: string, amount: number, when: string) => {
      if (isDemo) {
        setDemoPayments((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), { amount, when }] }));
        const card = CARDS.find((c) => c.id === id);
        if (card && amount >= card.balance - 0.01) {
          setDemoPaid((prev) => ({ ...prev, [id]: true }));
        }
        return;
      }
      if (!userId) return;
      const paidOn = new Date().toISOString().slice(0, 10);
      addPaymentRow(userId, id, amount, paidOn, when).then(loadReal);
    },
    [isDemo, setDemoPayments, setDemoPaid, userId, loadReal],
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

  const value = useMemo(
    () => ({
      cards,
      getCard,
      togglePaid,
      addPayment,
      paymentHistory,
      loaded: authLoading ? false : isDemo ? demoPaidLoaded && demoPaymentsLoaded : realLoaded,
      isDemo,
      addRealCard,
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
      addRealCard,
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
