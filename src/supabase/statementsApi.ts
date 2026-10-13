import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import { supabase } from './client';
import { DbStatement, ParsedStatement } from './types';

// There's no static "empty" state for statements that's meaningfully
// different from "we just can't reach the server" — email-triggered ones can
// land at any time — so the last successful fetch is mirrored to disk and
// used whenever a live fetch fails, instead of surfacing an empty list.
const STATEMENTS_CACHE_KEY = 'cardsManager:cache:statements';

export async function readPdfForUpload(fileUri: string): Promise<{ base64: string; hash: string }> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  return { base64, hash };
}

export async function findStatementByHash(userId: string, hash: string): Promise<DbStatement | null> {
  const { data, error } = await supabase
    .from('statements')
    .select('*')
    .eq('user_id', userId)
    .eq('file_hash', hash)
    .order('received_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function uploadStatementPdf(
  userId: string,
  base64: string,
  fileName: string,
  hash: string,
): Promise<DbStatement> {
  const path = `${userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from('statements')
    .upload(path, decode(base64), { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('statements')
    .insert({ user_id: userId, source: 'upload', status: 'pending', storage_path: path, file_hash: hash })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function parseStatement(statementId: string): Promise<ParsedStatement> {
  const { data, error } = await supabase.functions.invoke('parse-statement', {
    body: { statementId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.parsed as ParsedStatement;
}

export async function applyStatement(
  statementId: string,
  fields: ParsedStatement,
  cardId?: string,
  opts?: { replace?: boolean },
): Promise<{ cardId: string; created: boolean; transactionsInserted: number; duplicate?: boolean; cutoffDate?: string }> {
  const { data, error } = await supabase.functions.invoke('apply-statement', {
    body: { statementId, fields, cardId, replace: opts?.replace ?? false },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deleteStatement(statementId: string): Promise<void> {
  const { data: statement, error: fetchErr } = await supabase
    .from('statements')
    .select('storage_path')
    .eq('id', statementId)
    .single();
  if (fetchErr) throw fetchErr;

  if (statement?.storage_path) {
    const { error: storageErr } = await supabase.storage.from('statements').remove([statement.storage_path]);
    if (storageErr) throw storageErr;
  }

  const { error } = await supabase.from('statements').delete().eq('id', statementId);
  if (error) throw error;
}

export async function getStatementPdfUrl(statementId: string): Promise<string> {
  const { data: statement, error } = await supabase
    .from('statements')
    .select('storage_path')
    .eq('id', statementId)
    .single();
  if (error) throw error;
  if (!statement?.storage_path) throw new Error('This statement has no file to open.');

  const { data, error: signError } = await supabase.storage
    .from('statements')
    .createSignedUrl(statement.storage_path, 60 * 15);
  if (signError) throw signError;
  return data.signedUrl;
}

export async function listNeedsReviewStatements(userId: string): Promise<DbStatement[]> {
  try {
    const { data, error } = await supabase
      .from('statements')
      .select('*')
      .eq('user_id', userId)
      .order('received_at', { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    AsyncStorage.setItem(STATEMENTS_CACHE_KEY, JSON.stringify(rows)).catch(() => {});
    return rows;
  } catch (err) {
    try {
      const cached = await AsyncStorage.getItem(STATEMENTS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {
      // Corrupted cache — fall through and surface the original error.
    }
    throw err;
  }
}

export async function getStatement(statementId: string): Promise<DbStatement | null> {
  const { data, error } = await supabase.from('statements').select('*').eq('id', statementId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getStatementEmail(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('statement_email_token')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return `u-${data.statement_email_token}@stmts.poquetapp.com`;
}

// Gmail won't auto-forward to a new address until the user confirms it with
// the link (or, on older flows, the code) it emails there; receive-statement-email saves that code on the profile. Only
// a recent one is useful (Gmail codes are for the setup in progress).
export type GmailForwardingCode = { code: string | null; link: string | null; from: string | null; at: string };

export async function getGmailForwardingCode(userId: string): Promise<GmailForwardingCode | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('gmail_fwd_code, gmail_fwd_link, gmail_fwd_from, gmail_fwd_at, gmail_fwd_dismissed_at')
    .eq('id', userId)
    .single();
  if (error || !data || (!data.gmail_fwd_code && !data.gmail_fwd_link) || !data.gmail_fwd_at) return null;
  const ageMs = Date.now() - Date.parse(data.gmail_fwd_at);
  if (!(ageMs >= 0 && ageMs < 7 * 24 * 60 * 60 * 1000)) return null;
  if (data.gmail_fwd_dismissed_at && Date.parse(data.gmail_fwd_dismissed_at) >= Date.parse(data.gmail_fwd_at)) {
    return null;
  }
  return { code: data.gmail_fwd_code, link: data.gmail_fwd_link, from: data.gmail_fwd_from, at: data.gmail_fwd_at };
}

// Lets the user dismiss the "confirm Gmail forwarding" nag without actually
// confirming it in Gmail. Stamped against `at` (not "now") so a brand-new
// code/link that arrives later — e.g. the user re-sends it from Gmail —
// still shows, instead of staying dismissed forever.
export async function dismissGmailForwardingCode(userId: string, at: string): Promise<void> {
  await supabase.from('profiles').update({ gmail_fwd_dismissed_at: at }).eq('id', userId);
}

// "Quedarme con la anterior" after a re-read: parse-statement overwrote the
// statement's reading and flagged it for review, so put the old one back.
// "Volver a leer": the server reads the PDF again in the background and
// stores the result in reread_parsed, never touching the saved reading. The
// call returns as soon as it has started; the screen polls the row and a push
// arrives when it's ready, so leaving the screen or the app loses nothing.
export async function startReread(statementId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('parse-statement', {
    body: { statementId, reread: true },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

// Drops a finished, failed or abandoned re-read; the saved reading stays as is.
export async function clearReread(statementId: string): Promise<void> {
  const { error } = await supabase
    .from('statements')
    .update({ reread_parsed: null, reread_status: null, reread_started_at: null, reread_error: null })
    .eq('id', statementId);
  if (error) throw error;
}

// Deleting a saved statement takes its transactions with it (they'd otherwise
// keep counting as spending) and its PDF. If it was the card's most recent
// statement, the card's balance, minimum and dates go back to the previous
// one's, so the card never shows figures from a statement that's gone.
export async function deleteAppliedStatement(statementId: string): Promise<{ transactionsDeleted: number; rolledBack: boolean }> {
  const { data: st, error: stErr } = await supabase
    .from('statements')
    .select('id, card_id, storage_path, parsed')
    .eq('id', statementId)
    .single();
  if (stErr) throw stErr;

  const { data: gone, error: txErr } = await supabase
    .from('transactions')
    .delete()
    .eq('statement_id', statementId)
    .select('id');
  if (txErr) throw txErr;

  if (st.storage_path) {
    const { error: storageErr } = await supabase.storage.from('statements').remove([st.storage_path]);
    if (storageErr) throw storageErr;
  }
  const { error: delErr } = await supabase.from('statements').delete().eq('id', statementId);
  if (delErr) throw delErr;

  let rolledBack = false;
  const cutoff: string | undefined = (st.parsed as ParsedStatement | null)?.cutoff_date;
  if (st.card_id && cutoff) {
    const { data: card } = await supabase.from('cards').select('cutoff_date').eq('id', st.card_id).single();
    if (card?.cutoff_date === cutoff) {
      const { data: rest } = await supabase
        .from('statements')
        .select('parsed')
        .eq('card_id', st.card_id)
        .eq('status', 'applied');
      const prev = ((rest ?? []) as { parsed: ParsedStatement | null }[])
        .map((r) => r.parsed)
        .filter((p): p is ParsedStatement => !!p?.cutoff_date)
        .sort((a, b) => b.cutoff_date.localeCompare(a.cutoff_date))[0];
      if (prev) {
        const { error: cardErr } = await supabase
          .from('cards')
          .update({
            balance: prev.balance,
            minimum_payment: prev.minimum_payment,
            cutoff_date: prev.cutoff_date,
            due_date: prev.due_date,
            full_payment_due_date: prev.full_payment_due_date ?? null,
            full_payment_amount: prev.full_payment_amount ?? null,
            ...(prev.credit_limit ? { credit_limit: prev.credit_limit } : {}),
          })
          .eq('id', st.card_id);
        if (cardErr) throw cardErr;
        rolledBack = true;
      }
    }
  }
  return { transactionsDeleted: gone?.length ?? 0, rolledBack };
}
