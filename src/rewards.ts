import { Category } from './data';

export type Rewards = Partial<Record<Category, number>> & { note: string };

export const REWARDS: Record<string, Rewards> = {
  aliado: { groceries: 1, dining: 2, fuel: 1, travel: 3, home: 1, health: 1, note: 'Travel accelerator until 31 Dec' },
  bac: { groceries: 3, dining: 1, fuel: 2, travel: 1, home: 1, health: 2, note: 'Groceries 3% up to US$ 500/month' },
  davi: { groceries: 1, dining: 3, fuel: 1, travel: 1, home: 2, health: 1, note: 'Dining 3% Thu–Sun only' },
  bac2: { groceries: 1, dining: 1, fuel: 1, travel: 1, home: 1, health: 1, note: 'Flat 1% on everything' },
};
