import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { decode } from 'base64-arraybuffer';
import { supabase } from './client';
import { DbStatement, ParsedStatement } from './types';

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
): Promise<{ cardId: string; created: boolean; transactionsInserted: number }> {
  const { data, error } = await supabase.functions.invoke('apply-statement', {
    body: { statementId, fields },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
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
    .createSignedUrl(statement.storage_path, 60 * 5);
  if (signError) throw signError;
  return data.signedUrl;
}

export async function listNeedsReviewStatements(userId: string): Promise<DbStatement[]> {
  const { data, error } = await supabase
    .from('statements')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
