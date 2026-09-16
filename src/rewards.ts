import { Category } from './data';

export type Rewards = Partial<Record<Category, number>> & { note: string };

export const REWARDS: Record<string, Rewards> = {
  aliado: { Groceries: 1, Dining: 2, Fuel: 1, Travel: 3, Tech: 1, Health: 1, note: 'Travel accelerator until 31 Dec' },
  bac: { Groceries: 3, Dining: 1, Fuel: 2, Travel: 1, Tech: 1, Health: 2, note: 'Groceries 3% up to US$ 500/month' },
  davi: { Groceries: 1, Dining: 3, Fuel: 1, Travel: 1, Tech: 2, Health: 1, note: 'Dining 3% Thu–Sun only' },
  bac2: { Groceries: 1, Dining: 1, Fuel: 1, Travel: 1, Tech: 1, Health: 1, note: 'Flat 1% on everything' },
};
