export type RewardAccelerator = { category: string; rate: number; note?: string };

export type DbCard = {
  id: string;
  user_id: string;
  bank: string;
  product: string | null;
  network: string | null;
  last4: string | null;
  currency: string;
  balance: number;
  credit_limit: number;
  minimum_payment: number;
  cutoff_date: string | null;
  due_date: string | null;
  full_payment_due_date: string | null;
  full_payment_amount: number | null;
  paid_this_cycle: boolean;
  reward_program: string | null;
  reward_rate_base: number | null;
  reward_point_value: number | null;
  reward_accelerators: RewardAccelerator[];
  archived: boolean;
  nickname: string | null;
  color_key: string | null;
  created_at: string;
  updated_at: string;
};

export type NewDbCard = Pick<DbCard, 'bank'> &
  Partial<
    Omit<DbCard, 'id' | 'user_id' | 'bank' | 'created_at' | 'updated_at' | 'archived' | 'paid_this_cycle'>
  >;

export type DbCardAlias = {
  id: string;
  user_id: string;
  card_id: string;
  bank_text: string;
  last4: string | null;
  created_at: string;
};

export type DbPayment = {
  id: string;
  user_id: string;
  card_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
};

export type DbStatement = {
  id: string;
  user_id: string;
  card_id: string | null;
  bank: string | null;
  source: 'upload' | 'email';
  status: 'pending' | 'parsed' | 'needs_review' | 'applied' | 'failed';
  storage_path: string | null;
  file_hash: string | null;
  parsed: ParsedStatement | null;
  error_message: string | null;
  received_at: string;
  applied_at: string | null;
};

export type DbTransaction = {
  id: string;
  user_id: string;
  card_id: string;
  statement_id: string | null;
  occurred_on: string;
  merchant: string;
  description: string | null;
  amount: number;
  category: string | null;
  category_source: string | null;
  dedup_key: string;
  created_at: string;
};

export type ParsedTransaction = {
  date: string;
  merchant: string;
  amount: number;
  category?: string | null;
};

export type ParsedStatement = {
  bank: string;
  product?: string | null;
  network?: string | null;
  last4?: string | null;
  currency?: string;
  balance: number;
  credit_limit?: number | null;
  minimum_payment: number;
  cutoff_date: string;
  due_date: string;
  full_payment_due_date?: string | null;
  full_payment_amount?: number | null;
  transactions: ParsedTransaction[];
  confidence?: 'high' | 'medium' | 'low';
  notes?: string | null;
};
