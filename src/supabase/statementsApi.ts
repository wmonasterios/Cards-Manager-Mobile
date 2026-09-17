import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './client';
import { DbStatement, ParsedStatement } from './types';

export async function uploadStatementPdf(
  userId: string,
  fileUri: string,
  fileName: string,
): Promise<DbStatement> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const path = `${userId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from('statements')
    .upload(path, decode(base64), { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('statements')
    .insert({ user_id: userId, source: 'upload', status: 'pending', storage_path: path })
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

export async function listNeedsReviewStatements(userId: string): Promise<DbStatement[]> {
  const { data, error } = await supabase
    .from('statements')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
