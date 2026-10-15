import { supabase } from './client';

// Client side of the AI advisor (MVP). Reads go straight to the advisor_*
// tables (RLS: own rows only); asking a question goes through the
// advisor-chat edge function, which owns access, limits and the model call.

export type AdvisorStatus = {
  enabled: boolean;
  consented: boolean;
  monthlyLimit: number;
  usedMonth: number;
};

export type AdvisorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rating: -1 | 1 | null;
  created_at: string;
};

export type MemoryKind = 'goal' | 'preference' | 'event';
export type AdvisorMemoryItem = { id: string; kind: MemoryKind; content: string; created_at: string };

export type AskResult = {
  conversationId: string;
  messageId: string;
  answer: string;
  model: string;
  remaining: { month: number; day: number };
};

export class AdvisorError extends Error {
  code: string;
  resetsOn?: string;
  constructor(code: string, resetsOn?: string) {
    super(code);
    this.code = code;
    this.resetsOn = resetsOn;
  }
}

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AdvisorError('not_authenticated');
  return id;
}

export async function getAdvisorStatus(): Promise<AdvisorStatus> {
  const [access, consent, usage, planId] = await Promise.all([
    supabase.from('advisor_access').select('enabled, monthly_limit').maybeSingle(),
    supabase.from('advisor_consent').select('user_id').maybeSingle(),
    supabase.from('advisor_usage').select('id', { count: 'exact', head: true }).gte('created_at', monthStartIso()),
    uid().then((id) => supabase.rpc('effective_plan', { uid: id })),
  ]);
  if (access.error) throw access.error;
  // On for every plan with advisor_enabled; an advisor_access row overrides
  // that (and the monthly limit) for one user. Same rule as advisor-chat.
  const { data: plan } = await supabase
    .from('plans')
    .select('advisor_enabled, advisor_monthly_limit')
    .eq('id', (!planId.error && planId.data) || 'free')
    .maybeSingle();
  return {
    enabled: access.data ? !!access.data.enabled : !!plan?.advisor_enabled,
    consented: !!consent.data,
    monthlyLimit: access.data?.monthly_limit ?? plan?.advisor_monthly_limit ?? 5,
    usedMonth: usage.count ?? 0,
  };
}

export async function giveConsent(): Promise<void> {
  const { error } = await supabase.from('advisor_consent').upsert({ user_id: await uid() });
  if (error) throw error;
}

export async function revokeConsent(): Promise<void> {
  const { error } = await supabase.from('advisor_consent').delete().eq('user_id', await uid());
  if (error) throw error;
}

// The most recent conversation and its messages (the MVP shows one thread).
export async function loadLatestConversation(): Promise<{ id: string; messages: AdvisorMessage[] } | null> {
  const { data: conv, error } = await supabase
    .from('advisor_conversations')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!conv) return null;
  const { data: msgs, error: mErr } = await supabase
    .from('advisor_messages')
    .select('id, role, content, rating, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (mErr) throw mErr;
  return { id: conv.id, messages: (msgs ?? []) as AdvisorMessage[] };
}

export async function askAdvisor(message: string, conversationId: string | undefined, lang: string): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke('advisor-chat', {
    body: { message, conversationId, lang },
  });
  if (error) {
    // Non-2xx: the function's JSON body ({error, resetsOn?}) is on the Response.
    let body: any = null;
    try {
      body = await (error as any).context?.json?.();
    } catch {
      body = null;
    }
    throw new AdvisorError(body?.error ?? 'network', body?.resetsOn);
  }
  if (data?.error) throw new AdvisorError(data.error, data.resetsOn);
  return data as AskResult;
}

export async function rateMessage(id: string, rating: -1 | 1 | null): Promise<void> {
  const { error } = await supabase.from('advisor_messages').update({ rating }).eq('id', id);
  if (error) throw error;
}

export async function listMemory(): Promise<AdvisorMemoryItem[]> {
  const { data, error } = await supabase
    .from('advisor_memory')
    .select('id, kind, content, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdvisorMemoryItem[];
}

export async function addMemory(kind: MemoryKind, content: string): Promise<void> {
  const { error } = await supabase
    .from('advisor_memory')
    .insert({ user_id: await uid(), kind, content: content.trim().slice(0, 280) });
  if (error) throw error;
}

export async function deleteMemory(id: string): Promise<void> {
  const { error } = await supabase.from('advisor_memory').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllMemory(): Promise<void> {
  const { error } = await supabase.from('advisor_memory').delete().eq('user_id', await uid());
  if (error) throw error;
}

// Deletes every conversation (messages cascade). Usage rows stay — they're
// what the monthly limit counts, and only hold token counts, no text.
export async function deleteAllConversations(): Promise<void> {
  const { error } = await supabase.from('advisor_conversations').delete().eq('user_id', await uid());
  if (error) throw error;
}
