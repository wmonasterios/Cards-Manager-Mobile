import { supabase } from './client';
import { DbCard, DbPayment, DbTransaction, NewDbCard } from './types';
import { ALL_CATEGORIES, Card, Category, Transaction } from '../data';

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dbTransactionToTransaction(row: DbTransaction): Transaction {
  const category = (ALL_CATEGORIES as string[]).includes(row.category ?? '')
    ? (row.category as Category)
    : 'Other';
  return {
    id: row.id,
    merchant: row.merchant,
    sub: row.description ?? '',
    date: shortDate(row.occurred_on),
    iso: row.occurred_on,
    amount: Number(row.amount),
    category,
  };
}

export function dbCardToCard(row: DbCard, transactions: DbTransaction[] = []): Card {
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
    dueIso: row.due_date ?? undefined,
    plansNote: '',
    cycleNote: '',
    plans: [],
    tx: transactions
      .filter((t) => t.card_id === row.id)
      .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1))
      .map(dbTransactionToTransaction),
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

export async function deleteCardCompletely(cardId: string): Promise<void> {
  const { data: statements } = await supabase
    .from('statements')
    .select('storage_path')
    .eq('card_id', cardId);
  const paths = (statements ?? [])
    .map((s) => s.storage_path)
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    await supabase.storage.from('statements').remove(paths);
  }
  await supabase.from('statements').delete().eq('card_id', cardId);
  // Payments and transactions cascade-delete with the card.
  const { error } = await supabase.from('cards').delete().eq('id', cardId);
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

export async function listTransactions(userId: string): Promise<DbTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateTransactionCategory(
  userId: string,
  txId: string,
  merchant: string,
  category: Category,
  applyToAllWithMerchant: boolean,
): Promise<void> {
  if (applyToAllWithMerchant) {
    const { error } = await supabase
      .from('transactions')
      .update({ category })
      .eq('user_id', userId)
      .ilike('merchant', merchant);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('transactions').update({ category }).eq('id', txId);
    if (error) throw error;
  }
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
