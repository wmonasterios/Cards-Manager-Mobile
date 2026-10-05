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
): Promise<{ cardId: string; created: boolean; transactionsInserted: number }> {
  const { data, error } = await supabase.functions.invoke('apply-statement', {
    body: { statementId, fields, cardId },
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
