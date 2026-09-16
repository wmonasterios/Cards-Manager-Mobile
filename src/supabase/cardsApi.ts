import { supabase } from './client';
import { DbCard, DbPayment, NewDbCard } from './types';
import { Card } from '../data';

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dbCardToCard(row: DbCard): Card {
  return {
    id: row.id,
    bank: row.bank,
    product: row.product ?? '',
    last4: row.last4 ? `•••• ${row.last4}` : '•••• ----',
    network: row.network ?? '',
    cur: row.currency === 'USD' ? 'US$' : row.currency,
    balance: Number(row.balance),
    limit: Number(row.credit_limit),
    min: Number(row.minimum_payment),
    due: shortDate(row.due_date),
    cutoff: shortDate(row.cutoff_date),
    plansNote: '',
    cycleNote: '',
    plans: [],
    tx: [],
  };
}

export async function listCards(userId: string): Promise<DbCard[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCard(userId: string, card: NewDbCard): Promise<DbCard> {
  const { data, error } = await supabase
    .from('cards')
    .insert({ ...card, user_id: userId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateCard(cardId: string, patch: Partial<DbCard>): Promise<DbCard> {
  const { data, error } = await supabase
    .from('cards')
    .update(patch)
    .eq('id', cardId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function archiveCard(cardId: string): Promise<void> {
  const { error } = await supabase.from('cards').update({ archived: true }).eq('id', cardId);
  if (error) throw error;
}

export async function listPayments(userId: string): Promise<DbPayment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('paid_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addPaymentRow(
  userId: string,
  cardId: string,
  amount: number,
  paidOn: string,
  note?: string,
): Promise<DbPayment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({ user_id: userId, card_id: cardId, amount, paid_on: paidOn, note })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
