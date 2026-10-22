import { supabase } from './client';
import { deviceInfo } from '../appVersion';

export type ReportArea = 'parsing' | 'balances' | 'instalments' | 'reminders' | 'other';
export type ReportSource = 'settings' | 'review' | 'statement';

// Saves the report and emails it to support (edge function submit-report).
// With allowReview, statementId links that statement; without an id the
// server uses the user's newest one.
export async function submitReport(args: {
  area: ReportArea;
  message: string;
  allowReview: boolean;
  statementId?: string;
  source: ReportSource;
  lang: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke('submit-report', {
    body: {
      area: args.area,
      message: args.message,
      allowReview: args.allowReview,
      statementId: args.statementId,
      source: args.source,
      device: deviceInfo(args.lang),
    },
  });
  if (error) {
    const status = (error as any)?.context?.status;
    const err = new Error(status === 429 ? 'too_many' : 'send_failed') as Error & { status?: number };
    err.status = status;
    throw err;
  }
  return { id: (data as any)?.id };
}
