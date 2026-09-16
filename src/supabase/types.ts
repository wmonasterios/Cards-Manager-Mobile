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
  created_at: string;
  updated_at: string;
};

export type NewDbCard = Pick<DbCard, 'bank'> &
  Partial<
    Omit<DbCard, 'id' | 'user_id' | 'bank' | 'created_at' | 'updated_at' | 'archived' | 'paid_this_cycle'>
  >;

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
  parsed: Record<string, unknown> | null;
  error_message: string | null;
  received_at: string;
  applied_at: string | null;
};
