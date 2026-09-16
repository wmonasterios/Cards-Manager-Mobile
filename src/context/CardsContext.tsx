import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { CARDS, Card } from '../data';
import { decorateCard, DecoratedCard, Payment } from '../decorate';
import { useT } from '../i18n/LocaleContext';
import { useColors } from '../theme/ThemeContext';

type CardsContextValue = {
  cards: DecoratedCard[];
  getCard: (id: string) => DecoratedCard | undefined;
  togglePaid: (id: string) => void;
  addPayment: (id: string, amount: number, when: string) => void;
  paymentHistory: (id: string) => Payment[];
};

const CardsContext = createContext<CardsContextValue | null>(null);

export function CardsProvider({ children }: { children: React.ReactNode }) {
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [payments, setPayments] = useState<Record<string, Payment[]>>({});
  const t = useT();
  const colors = useColors();

  const cards = useMemo(
    () => CARDS.map((c: Card) => decorateCard(c, paid[c.id], payments[c.id] ?? [], t, colors)),
    [paid, payments, t, colors],
  );

  const getCard = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);

  const togglePaid = useCallback((id: string) => {
    setPaid((prev) => ({ ...prev, [id]: !(prev[id] ?? CARDS.find((c) => c.id === id)?.balance === 0) }));
  }, []);

  const addPayment = useCallback((id: string, amount: number, when: string) => {
    setPayments((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), { amount, when }] }));
    const card = CARDS.find((c) => c.id === id);
    if (card && amount >= card.balance - 0.01) {
      setPaid((prev) => ({ ...prev, [id]: true }));
    }
  }, []);

  const paymentHistory = useCallback((id: string) => payments[id] ?? [], [payments]);

  const value = useMemo(
    () => ({ cards, getCard, togglePaid, addPayment, paymentHistory }),
    [cards, getCard, togglePaid, addPayment, paymentHistory],
  );

  return <CardsContext.Provider value={value}>{children}</CardsContext.Provider>;
}

export function useCards() {
  const ctx = useContext(CardsContext);
  if (!ctx) throw new Error('useCards must be used within CardsProvider');
  return ctx;
}
