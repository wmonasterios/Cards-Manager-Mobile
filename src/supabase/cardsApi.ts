import { supabase } from './client';
import { DbCard, DbCardAlias, DbPayment, DbTransaction, NewDbCard } from './types';
import { ALL_CATEGORIES, Card, Category, InstalmentPlan, Transaction } from '../data';

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dbTransactionToTransaction(row: DbTransaction): Transaction {
  const category = (ALL_CATEGORIES as string[]).includes(row.category ?? '')
    ? (row.category as Category)
    : 'other';
  return {
    id: row.id,
    merchant: row.merchant,
    sub: row.description ?? '',
    date: shortDate(row.occurred_on),
    iso: row.occurred_on,
    amount: Number(row.amount),
    category,
    plan: row.plan ?? undefined,
    rate: row.plan_rate ?? undefined,
    statementId: row.statement_id ?? undefined,
    categorySource: row.category_source ?? undefined,
  };
}

// A statement only ever shows one line per month for an ongoing instalment
// purchase (e.g. "4/12" this month, "5/12" next), so there's no stable plan
// id to group by across months — the best available signal is merchant name,
// taking the most recently seen line as that plan's current status.
function parsePlanProgress(planLabel: string): { current: number; total: number } | null {
  const match = planLabel.match(/(\d+)\s*(?:\/|de|of)\s*(\d+)/i);
  if (!match) return null;
  return { current: Number(match[1]), total: Number(match[2]) };
}

function buildInstalmentPlans(transactions: DbTransaction[]): InstalmentPlan[] {
  const latestByMerchant = new Map<string, DbTransaction>();
  for (const row of transactions) {
    if (!row.plan) continue;
    const key = row.merchant.trim().toLowerCase();
    const existing = latestByMerchant.get(key);
    if (!existing || row.occurred_on > existing.occurred_on) latestByMerchant.set(key, row);
  }
  return Array.from(latestByMerchant.values()).map((row) => {
    const progress = parsePlanProgress(row.plan!);
    const monthly = Math.abs(Number(row.amount));
    const remainingInstalments = progress ? Math.max(0, progress.total - progress.current) : 0;
    return {
      merchant: row.merchant,
      plan: row.plan!,
      rate: row.plan_rate ?? '',
      monthly,
      remaining: remainingInstalments * monthly,
      pct: progress ? Math.round((progress.current / progress.total) * 100) : 0,
    };
  });
}

export function dbCardToCard(row: DbCard, transactions: DbTransaction[] = []): Card {
  const cardTx = transactions.filter((t) => t.card_id === row.id);
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
    cutoffIso: row.cutoff_date ?? undefined,
    plansNote: '',
    cycleNote: '',
    plans: buildInstalmentPlans(cardTx),
    nickname: row.nickname ?? undefined,
    colorKey: row.color_key ?? undefined,
    tx: cardTx.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)).map(dbTransactionToTransaction),
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

// Every (bank text, last4) combination that has ever been confirmed to
// belong to each of the user's cards — used to auto-recognize a statement
// without re-asking, even after a card gets renewed with new last4 digits.
export async function listCardAliases(userId: string): Promise<DbCardAlias[]> {
  const { data, error } = await supabase.from('card_aliases').select('*').eq('user_id', userId);
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
  // Always remember this as the user's personal chain override, so future
  // statements categorize the same chain this way from the start.
  await supabase.rpc('set_user_merchant_override', { p_merchant_raw: merchant, p_category_id: category });

  if (applyToAllWithMerchant) {
    const { error } = await supabase.rpc('bulk_recategorize_by_chain', {
      p_merchant_raw: merchant,
      p_category_id: category,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('transactions')
      .update({ category, category_source: 'manual' })
      .eq('id', txId);
    if (error) throw error;
  }
}

export async function recordSuggestionFeedback(merchant: string, action: 'confirm' | 'reject'): Promise<void> {
  await supabase.rpc('record_suggestion_feedback', { p_merchant_raw: merchant, p_action: action });
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
