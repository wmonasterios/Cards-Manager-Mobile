import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Linking,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { DateField } from '../components/DateField';
import { ProgressBar } from '../components/ProgressBar';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import {
  readPdfForUpload,
  findStatementByHash,
  uploadStatementPdf,
  parseStatement,
  applyStatement,
  deleteStatement,
  listNeedsReviewStatements,
  getStatement,
  getStatementPdfUrl,
  getStatementEmail,
} from '../supabase/statementsApi';
import { listCardAliases } from '../supabase/cardsApi';
import { DbStatement, DbCardAlias, ParsedStatement } from '../supabase/types';
import { DecoratedCard } from '../decorate';

type UploadStage = 'idle' | 'parsing' | 'review';
type RealStage = 'idle' | 'uploading' | 'parsing' | 'review' | 'error';

const INBOX = 'w.monasterios.7f3a@in.cardsmanager.app';

const PARSE_STEPS: Record<'en' | 'es', { label: string; mark: string; done: boolean }[]> = {
  en: [
    { label: 'Statement read · 4 pages', mark: '✓', done: true },
    { label: 'Bank recognised · Banco Aliado', mark: '✓', done: true },
    { label: 'Extracting balances and dates', mark: '·', done: false },
    { label: 'Matching transactions to categories', mark: '·', done: false },
  ],
  es: [
    { label: 'Estado de cuenta leído · 4 páginas', mark: '✓', done: true },
    { label: 'Banco reconocido · Banco Aliado', mark: '✓', done: true },
    { label: 'Extrayendo saldos y fechas', mark: '·', done: false },
    { label: 'Clasificando transacciones', mark: '·', done: false },
  ],
};

const PARSED_FIELDS: Record<'en' | 'es', { label: string; value: string; ok: boolean }[]> = {
  en: [
    { label: 'Statement balance', value: 'US$ 3,420.10', ok: true },
    { label: 'Minimum payment', value: 'US$ 171.01', ok: true },
    { label: 'Full payment due', value: '18 Sep 2026', ok: true },
    { label: 'Statement cut-off', value: '30 Aug 2026', ok: true },
    { label: 'Credit limit', value: 'US$ 12,000.00', ok: true },
    { label: 'Instalment purchases', value: '2 found', ok: false },
  ],
  es: [
    { label: 'Saldo del estado', value: 'US$ 3,420.10', ok: true },
    { label: 'Pago mínimo', value: 'US$ 171.01', ok: true },
    { label: 'Pago de contado', value: '18 sep 2026', ok: true },
    { label: 'Fecha de corte', value: '30 ago 2026', ok: true },
    { label: 'Límite de crédito', value: 'US$ 12,000.00', ok: true },
    { label: 'Compras a cuotas', value: '2 encontradas', ok: false },
  ],
};

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromIso(iso: string | null | undefined): Date {
  return iso ? new Date(iso + 'T00:00:00') : new Date();
}

function statementDateLabel(s: DbStatement, lang: 'en' | 'es'): string {
  const cutoff = s.parsed?.cutoff_date;
  if (cutoff) {
    const cutoffLabel = fromIso(cutoff).toLocaleDateString(lang === 'es' ? 'es-PA' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
    return lang === 'es' ? `Corte ${cutoffLabel}` : `Cutoff ${cutoffLabel}`;
  }
  const uploadedLabel = new Date(s.received_at).toLocaleDateString(lang === 'es' ? 'es-PA' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
  return lang === 'es' ? `Subido ${uploadedLabel}` : `Uploaded ${uploadedLabel}`;
}

// Absolute month index (year*12 + month) — lets gap math ignore day-of-month
// drift between cut-offs (e.g. the 27th one month, the 30th the next).
function monthIndex(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + (m - 1);
}

function monthIsoFromIndex(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

type TimelineItem = { kind: 'statement'; statement: DbStatement } | { kind: 'gap'; monthIso: string };

// Only flags months strictly BETWEEN statements we actually have — never
// before the earliest one (a new card with one statement has nothing to
// compare against yet) and never after the latest (that's what "Needs
// attention" on Home already covers).
function buildCardTimeline(statements: DbStatement[]): TimelineItem[] {
  const dated = statements
    .filter((s) => !!s.parsed?.cutoff_date)
    .sort((a, b) => a.parsed!.cutoff_date.localeCompare(b.parsed!.cutoff_date));
  const undated = statements.filter((s) => !s.parsed?.cutoff_date);

  const items: TimelineItem[] = [];
  dated.forEach((s, i) => {
    items.push({ kind: 'statement', statement: s });
    if (i < dated.length - 1) {
      const curr = monthIndex(s.parsed!.cutoff_date);
      const next = monthIndex(dated[i + 1].parsed!.cutoff_date);
      for (let idx = curr + 1; idx < next; idx++) {
        items.push({ kind: 'gap', monthIso: monthIsoFromIndex(idx) });
      }
    }
  });
  items.reverse(); // most recent first
  return [...undated.map((s): TimelineItem => ({ kind: 'statement', statement: s })), ...items];
}

function statusLabel(status: DbStatement['status'], lang: 'en' | 'es') {
  const map: Record<DbStatement['status'], [string, string]> = {
    pending: ['Processing', 'Procesando'],
    parsed: ['Parsed', 'Leído'],
    needs_review: ['Needs review', 'Revisar'],
    applied: ['Applied', 'Aplicado'],
    failed: ['Failed', 'Falló'],
  };
  return map[status][lang === 'es' ? 1 : 0];
}

// FunctionsFetchError means the request to Supabase never got a response at all
// (dropped connection, no signal) — the raw SDK message ("Failed to send a
// request to the Edge Function") isn't actionable, so point at the network instead.
function friendlyErrorMessage(err: any, lang: 'en' | 'es'): string {
  if (err instanceof FunctionsFetchError) {
    return lang === 'es'
      ? 'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.'
      : 'Could not reach the server. Check your internet connection and try again.';
  }
  if (err instanceof ParseStallError) {
    return lang === 'es'
      ? 'Esto está tardando más de lo normal y no pudimos confirmar el resultado. Revisa el historial en un momento.'
      : "This is taking longer than usual and we couldn't confirm the result. Check the history in a moment.";
  }
  return err?.message ?? String(err);
}

// Simulated progress toward an asymptote — there is no real progress signal from
// a single request/response edge function call, so this only ever creeps toward
// 92% while waiting, and is snapped to 100% once the response actually arrives.
const PARSE_ESTIMATE_SECONDS = 20;

// If the app gets backgrounded mid-request (e.g. the user switches away to
// tap a push notification), the underlying fetch can go quiet without ever
// resolving OR rejecting — no error to catch, just a spinner that waits
// forever while the server has actually already finished. This bounds how
// long we wait on the original request before checking the database directly.
const PARSE_STALL_MS = 60000;
class ParseStallError extends Error {}

// If the phone's connection to parse-statement drops mid-request (e.g. the app
// got backgrounded), the edge function itself keeps running on the server and
// usually finishes anyway — only the phone's view of the outcome was lost. So
// instead of treating a dropped connection as a hard failure, poll the
// statement row directly until it shows the real outcome.
async function pollForCompletion(id: string, maxWaitMs = 90000, intervalMs = 4000): Promise<DbStatement | null> {
  const deadline = Date.now() + maxWaitMs;
  let last: DbStatement | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      last = await getStatement(id);
    } catch {
      continue;
    }
    if (last && last.status !== 'pending') return last;
  }
  return last;
}

function RealStatementsFlow({ navigation, route }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const { refresh, getCard, cards } = useCards();
  const userId = session?.user.id;

  const [emailAddress, setEmailAddress] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getStatementEmail(userId)
      .then(setEmailAddress)
      .catch(() => {});
  }, [userId]);

  const copyInbox = async () => {
    if (!emailAddress) return;
    await Clipboard.setStringAsync(emailAddress);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2600);
  };

  const filterCardId: string | undefined = route?.params?.cardId;
  const [showAllCards, setShowAllCards] = useState(false);
  const filterCard = filterCardId ? getCard(filterCardId) : undefined;

  const [stage, setStage] = useState<RealStage>('idle');
  const [statementId, setStatementId] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedStatement | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [applying, setApplying] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [history, setHistory] = useState<DbStatement[]>([]);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseSeconds, setParseSeconds] = useState(0);
  const parseTicker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [aliases, setAliases] = useState<DbCardAlias[]>([]);
  // undefined = follow the automatic match; null = user said "it's a new card";
  // a string = a specific card the user picked or confirmed explicitly.
  const [chosenCardId, setChosenCardId] = useState<string | null | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);

  const visibleHistory =
    filterCard && !showAllCards ? history.filter((s) => s.card_id === filterCard.id) : history;

  // Gaps between cut-off months only make sense once we're looking at one
  // card's own chronology, not the mixed, upload-ordered "all cards" list.
  const timeline = useMemo(
    () => (filterCard && !showAllCards ? buildCardTimeline(visibleHistory) : []),
    [filterCard, showAllCards, visibleHistory],
  );

  const startParseTicker = () => {
    setParseProgress(0);
    setParseSeconds(0);
    clearInterval(parseTicker.current);
    parseTicker.current = setInterval(() => {
      setParseSeconds((s) => s + 1);
      setParseProgress((p) => p + (92 - p) * 0.12);
    }, 400);
  };

  const stopParseTicker = (finalPct: number) => {
    clearInterval(parseTicker.current);
    setParseProgress(finalPct);
  };

  useEffect(() => () => clearInterval(parseTicker.current), []);

  const [refreshing, setRefreshing] = useState(false);

  // Statements that arrive by email are parsed server-side without the client
  // ever calling parseStatement() itself — if that background trigger dropped
  // for any reason, the row is left stuck on "pending" forever. Nudge it along
  // from here instead, once per statement per session.
  const nudgedRef = useRef<Set<string>>(new Set());

  const loadHistory = async () => {
    if (!userId) return;
    try {
      const rows = await listNeedsReviewStatements(userId);
      setHistory(rows);
      const staleCutoff = Date.now() - 20_000;
      const nudges = rows
        .filter(
          (s) =>
            s.source === 'email' &&
            s.status === 'pending' &&
            new Date(s.received_at).getTime() < staleCutoff &&
            !nudgedRef.current.has(s.id),
        )
        .map((s) => {
          nudgedRef.current.add(s.id);
          return parseStatement(s.id).catch(() => {});
        });
      // Awaited so pull-to-refresh keeps spinning for as long as the nudged
      // parse actually takes, instead of stopping instantly and leaving the
      // list looking unchanged until a second, unrelated manual refresh.
      if (nudges.length > 0) {
        await Promise.all(nudges);
        setHistory(await listNeedsReviewStatements(userId));
      }
    } catch {
      // Non-critical: history is a nice-to-have, not worth surfacing an error for.
    }
  };

  useEffect(() => {
    loadHistory();
    if (userId) {
      listCardAliases(userId).then(setAliases).catch(() => {});
    }
  }, [userId]);

  // Tabs stay mounted in React Navigation, so a statement that finishes
  // processing while this screen is in the background never triggers the
  // mount-only effect above — refresh again every time the tab regains focus.
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [userId]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadHistory();
    } finally {
      setRefreshing(false);
    }
  };

  // Which card this statement belongs to is never guessed from live text —
  // it's either forced (uploading from inside a specific card), an exact
  // match against a previously-confirmed (bank, last4) alias, a same-bank
  // match (possibly a renewal, if last4 changed), or genuinely new.
  type Resolution =
    | { kind: 'forced'; card: DecoratedCard }
    | { kind: 'alias'; card: DecoratedCard }
    | { kind: 'match'; card: DecoratedCard; sameLast4: boolean }
    | { kind: 'ambiguous'; candidates: DecoratedCard[] }
    | { kind: 'new' };

  const resolution: Resolution = useMemo(() => {
    if (!fields) return { kind: 'new' };
    if (filterCard) return { kind: 'forced', card: filterCard };

    const bankNorm = fields.bank.trim().toLowerCase();
    const last4Norm = (fields.last4 ?? '').replace(/\D/g, '').slice(-4) || null;

    const aliasHit = aliases.find((a) => a.bank_text === bankNorm && a.last4 === last4Norm);
    const aliasCard = aliasHit ? cards.find((c) => c.id === aliasHit.card_id) : undefined;
    if (aliasCard) return { kind: 'alias', card: aliasCard };

    const bankMatches = cards.filter((c) => c.bank.trim().toLowerCase() === bankNorm);
    if (bankMatches.length === 1) {
      return { kind: 'match', card: bankMatches[0], sameLast4: bankMatches[0].last4 === last4Norm };
    }
    if (bankMatches.length > 1) return { kind: 'ambiguous', candidates: bankMatches };
    return { kind: 'new' };
  }, [fields, filterCard, aliases, cards]);

  const chosenCard = chosenCardId ? cards.find((c) => c.id === chosenCardId) : undefined;

  const confirmDuplicateUpload = (existing: DbStatement): Promise<boolean> =>
    new Promise((resolve) => {
      const dateLabel = new Date(existing.received_at).toLocaleDateString(
        lang === 'es' ? 'es-PA' : 'en-US',
        { day: 'numeric', month: 'short' },
      );
      Alert.alert(
        lang === 'es' ? 'Ya subiste este PDF' : "You've already uploaded this PDF",
        lang === 'es'
          ? `Este mismo archivo se subió el ${dateLabel} (${existing.bank ?? 'banco desconocido'} · ${statusLabel(existing.status, lang)}). ¿Procesarlo de nuevo de todas formas?`
          : `This exact file was uploaded on ${dateLabel} (${existing.bank ?? 'unknown bank'} · ${statusLabel(existing.status, lang)}). Process it again anyway?`,
        [
          { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: lang === 'es' ? 'Procesar de nuevo' : 'Process again', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });

  // Shared by both recovery paths below: a dropped connection or a stalled
  // request don't mean the parse actually failed — the edge function keeps
  // running server-side. Check the real outcome before showing a scary error.
  // Returns true once it has fully handled the UI (review or error state).
  const recoverFromStall = async (statementId: string, originalErr: any): Promise<boolean> => {
    const recovered = await pollForCompletion(statementId);
    if (recovered?.status === 'needs_review' && recovered.parsed) {
      stopParseTicker(100);
      setFields(recovered.parsed);
      setChosenCardId(undefined);
      setStage('review');
      return true;
    }
    if (recovered?.status === 'failed') {
      clearInterval(parseTicker.current);
      setErrorMsg(recovered.error_message ?? friendlyErrorMessage(originalErr, lang));
      setStage('error');
      return true;
    }
    if (recovered?.status === 'pending') {
      clearInterval(parseTicker.current);
      setErrorMsg(
        lang === 'es'
          ? 'El servidor sigue leyendo tu PDF — está tardando más de lo normal. Dale un minuto más y revisa el historial; debería aparecer listo para revisar sin que tengas que subirlo de nuevo.'
          : "The server is still reading your PDF — it's taking longer than usual. Give it another minute and check the history; it should show up ready to review without uploading it again.",
      );
      setStage('error');
      return true;
    }
    return false;
  };

  const pickAndUpload = async () => {
    if (!userId) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setStage('uploading');
    setErrorMsg('');
    let currentStatementId: string | null = null;
    try {
      const { base64, hash } = await readPdfForUpload(asset.uri);
      const existing = await findStatementByHash(userId, hash);
      if (existing) {
        setStage('idle');
        const proceed = await confirmDuplicateUpload(existing);
        if (!proceed) return;
        setStage('uploading');
      }
      const statement = await uploadStatementPdf(userId, base64, asset.name ?? 'statement.pdf', hash);
      currentStatementId = statement.id;
      setStatementId(statement.id);
      setStage('parsing');
      startParseTicker();

      // If the app gets backgrounded (e.g. to tap the "ready to review" push
      // notification) this request can go silent instead of erroring, so it's
      // raced against a timeout rather than awaited indefinitely.
      const parsePromise = parseStatement(statement.id);
      parsePromise.catch(() => {}); // avoid an unhandled rejection if the timeout wins first
      const parsed = await Promise.race([
        parsePromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new ParseStallError()), PARSE_STALL_MS)),
      ]);

      stopParseTicker(100);
      setFields(parsed);
      setChosenCardId(undefined);
      setStage('review');
    } catch (err: any) {
      if ((err instanceof FunctionsFetchError || err instanceof ParseStallError) && currentStatementId) {
        const handled = await recoverFromStall(currentStatementId, err);
        if (handled) return;
      }
      clearInterval(parseTicker.current);
      setErrorMsg(friendlyErrorMessage(err, lang));
      setStage('error');
    } finally {
      loadHistory();
    }
  };

  const resumeReview = (s: DbStatement) => {
    if (s.status !== 'needs_review' || !s.parsed) return;
    setStatementId(s.id);
    setFields(s.parsed);
    setChosenCardId(s.card_id ?? undefined);
    setStage('review');
  };

  const [openingStatementId, setOpeningStatementId] = useState<string | null>(null);

  const openStatementPdf = async (id: string) => {
    setOpeningStatementId(id);
    try {
      const url = await getStatementPdfUrl(id);
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert(
        lang === 'es' ? 'No se pudo abrir el PDF' : 'Could not open the PDF',
        friendlyErrorMessage(err, lang),
      );
    } finally {
      setOpeningStatementId(null);
    }
  };

  // Statements still needing review resume the review flow; every other
  // statement (applied, failed) just opens its original PDF, since there is
  // nothing left to review.
  const handleStatementPress = (s: DbStatement) => {
    if (s.status === 'needs_review') {
      resumeReview(s);
    } else {
      openStatementPdf(s.id);
    }
  };

  const resolvedCardId = (): string | undefined | 'ambiguous' => {
    if (chosenCardId !== undefined) return chosenCardId ?? undefined;
    if (resolution.kind === 'forced' || resolution.kind === 'alias') return resolution.card.id;
    if (resolution.kind === 'match' && resolution.sameLast4) return resolution.card.id;
    if (resolution.kind === 'match') return undefined; // renewal guess needs explicit confirmation
    if (resolution.kind === 'ambiguous') return 'ambiguous';
    return undefined;
  };

  const confirmApply = async () => {
    if (!statementId || !fields) return;
    const cardId = resolvedCardId();
    if (cardId === 'ambiguous') {
      Alert.alert(
        lang === 'es' ? 'Elige la tarjeta' : 'Pick the card',
        lang === 'es'
          ? 'Hay varias tarjetas de este banco. Elige a cuál pertenece este estado de cuenta.'
          : 'There are several cards from this bank. Pick which one this statement belongs to.',
      );
      setPickerOpen(true);
      return;
    }
    if (resolution.kind === 'match' && !resolution.sameLast4 && chosenCardId === undefined) {
      // A same-bank match with a different last4 could be a renewal — don't
      // silently assume it, ask once.
      Alert.alert(
        lang === 'es' ? '¿Es la misma tarjeta renovada?' : 'Is this the same card, renewed?',
        lang === 'es'
          ? `El banco coincide con ${resolution.card.displayName}, pero los últimos 4 dígitos cambiaron (de ${resolution.card.last4} a ${fields.last4 ?? '----'}).`
          : `The bank matches ${resolution.card.displayName}, but the last 4 digits changed (from ${resolution.card.last4} to ${fields.last4 ?? '----'}).`,
        [
          {
            text: lang === 'es' ? 'No, es otra' : 'No, different card',
            style: 'cancel',
            onPress: () => setPickerOpen(true),
          },
          {
            text: lang === 'es' ? 'Sí, es la misma' : 'Yes, same card',
            onPress: () => setChosenCardId(resolution.card.id),
          },
        ],
      );
      return;
    }
    setApplying(true);
    try {
      const result = await applyStatement(statementId, fields, cardId);
      await refresh();
      setStage('idle');
      setStatementId(null);
      setFields(null);
      setChosenCardId(undefined);
      navigation.navigate('CardDetail', { cardId: result.cardId });
    } catch (err: any) {
      Alert.alert(lang === 'es' ? 'No se pudo guardar' : 'Could not save', friendlyErrorMessage(err, lang));
    } finally {
      setApplying(false);
      loadHistory();
    }
  };

  // Just steps back to the list without touching the statement — for the
  // back caret, which shouldn't delete anything on its own.
  const backFromReview = () => {
    setStage('idle');
    setStatementId(null);
    setFields(null);
    setChosenCardId(undefined);
  };

  // The "Discard" button, in contrast, means it: confirms, then actually
  // deletes the statement (and its PDF) so it stops showing up as needs-review.
  const discardReview = () => {
    if (!statementId) return;
    Alert.alert(
      lang === 'es' ? '¿Descartar este estado de cuenta?' : 'Discard this statement?',
      lang === 'es'
        ? 'Se elimina permanentemente, junto con el PDF. No se puede deshacer.'
        : 'This permanently deletes it, along with the PDF. This cannot be undone.',
      [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'es' ? 'Descartar' : 'Discard',
          style: 'destructive',
          onPress: async () => {
            setDiscarding(true);
            try {
              await deleteStatement(statementId);
              setStage('idle');
              setStatementId(null);
              setFields(null);
              setChosenCardId(undefined);
            } catch (err: any) {
              Alert.alert(
                lang === 'es' ? 'No se pudo descartar' : 'Could not discard',
                friendlyErrorMessage(err, lang),
              );
            } finally {
              setDiscarding(false);
              loadHistory();
            }
          },
        },
      ],
    );
  };

  const renderMatchBanner = () => {
    if (!fields) return null;
    if (resolution.kind === 'forced') {
      return (
        <View style={styles.matchInlineBanner}>
          <Text style={styles.matchInlineTitle}>
            {lang === 'es' ? `Se guardará en ${resolution.card.displayName}` : `Will save to ${resolution.card.displayName}`}
          </Text>
          <Text style={styles.matchInlineSub}>•••• {resolution.card.last4}</Text>
        </View>
      );
    }
    if (chosenCardId !== undefined) {
      if (chosenCardId === null) {
        return (
          <View style={styles.matchInlineBanner}>
            <Text style={styles.matchInlineTitle}>
              {lang === 'es' ? 'Se creará una tarjeta nueva' : 'A new card will be created'}
            </Text>
            <Pressable onPress={() => setPickerOpen(true)} hitSlop={6}>
              <Text style={styles.matchInlineLink}>{lang === 'es' ? 'Elegir una existente' : 'Pick an existing one'}</Text>
            </Pressable>
          </View>
        );
      }
      if (chosenCard) {
        return (
          <View style={styles.matchInlineBanner}>
            <Text style={styles.matchInlineTitle}>
              {lang === 'es' ? `Se guardará en ${chosenCard.displayName}` : `Will save to ${chosenCard.displayName}`}
            </Text>
            <Pressable onPress={() => setPickerOpen(true)} hitSlop={6}>
              <Text style={styles.matchInlineLink}>{lang === 'es' ? 'Cambiar' : 'Change'}</Text>
            </Pressable>
          </View>
        );
      }
      return null;
    }
    if (resolution.kind === 'alias' || (resolution.kind === 'match' && resolution.sameLast4)) {
      const card = resolution.card;
      return (
        <View style={styles.matchInlineBanner}>
          <Text style={styles.matchInlineTitle}>
            {lang === 'es' ? `Se guardará en ${card.displayName}` : `Will save to ${card.displayName}`}
          </Text>
          <Pressable onPress={() => setPickerOpen(true)} hitSlop={6}>
            <Text style={styles.matchInlineLink}>{lang === 'es' ? 'Cambiar' : 'Change'}</Text>
          </Pressable>
        </View>
      );
    }
    if (resolution.kind === 'match') {
      const card = resolution.card;
      return (
        <View style={styles.renewalBanner}>
          <Text style={styles.matchInlineTitle}>
            {lang === 'es'
              ? `¿Es la renovación de ${card.displayName}? Los últimos 4 dígitos cambiaron.`
              : `Is this the renewal of ${card.displayName}? The last 4 digits changed.`}
          </Text>
          <View style={styles.renewalActions}>
            <Pressable onPress={() => setChosenCardId(card.id)} style={styles.renewalYes}>
              <Text style={styles.renewalYesText}>{lang === 'es' ? 'Sí, la misma' : 'Yes, same card'}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.renewalNo}>
              <Text style={styles.renewalNoText}>{lang === 'es' ? 'No, otra' : 'No, different'}</Text>
            </Pressable>
          </View>
        </View>
      );
    }
    if (resolution.kind === 'ambiguous') {
      return (
        <View style={styles.renewalBanner}>
          <Text style={styles.matchInlineTitle}>
            {lang === 'es' ? 'Hay varias tarjetas de este banco. ¿Cuál es?' : 'There are several cards from this bank. Which one?'}
          </Text>
          <View style={{ marginTop: 10, gap: 6 }}>
            {resolution.candidates.map((c) => (
              <Pressable key={c.id} onPress={() => setChosenCardId(c.id)} style={styles.candidateRow}>
                <Text style={styles.candidateText}>{c.displayName} · •••• {c.last4}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setChosenCardId(null)} hitSlop={6} style={{ marginTop: 8 }}>
            <Text style={styles.matchInlineLink}>{lang === 'es' ? 'Ninguna, es nueva' : "None, it's new"}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.matchInlineBanner}>
        <Text style={styles.matchInlineTitle}>{lang === 'es' ? 'Parece una tarjeta nueva' : 'Looks like a new card'}</Text>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={6}>
          <Text style={styles.matchInlineLink}>{lang === 'es' ? '¿Ya la tienes?' : 'Already have it?'}</Text>
        </Pressable>
      </View>
    );
  };

  const setField = <K extends keyof ParsedStatement>(key: K, value: ParsedStatement[K]) => {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const numeric = (v: string) => v.replace(/[^0-9.]/g, '');

  if (stage === 'uploading' || stage === 'parsing') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.top}>
          <Text style={[styles.title, { marginTop: 0 }]}>
            {stage === 'uploading'
              ? (lang === 'es' ? 'Subiendo tu PDF' : 'Uploading your PDF')
              : (lang === 'es' ? 'Leyendo tu estado de cuenta' : 'Reading your statement')}
          </Text>
          <Text style={styles.sub}>
            {stage === 'uploading'
              ? (lang === 'es' ? 'Esto puede tardar unos segundos.' : 'This can take a few seconds.')
              : (lang === 'es'
                ? 'Suele tardar entre 10 y 30 segundos, más si el estado es largo.'
                : 'Usually takes 10–30 seconds, longer for a long statement.')}
          </Text>
        </View>
        {stage === 'uploading' ? (
          <View style={[styles.section, { alignItems: 'center', paddingTop: 30 }]}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        ) : (
          <View style={[styles.section, { paddingTop: 30 }]}>
            <ProgressBar pct={parseProgress} fill={colors.accent} height={6} />
            <View style={styles.parseProgressRow}>
              <Text style={styles.parseProgressPct}>{Math.round(parseProgress)}%</Text>
              <Text style={styles.parseProgressTime}>
                {parseSeconds}s
                {parseSeconds > PARSE_ESTIMATE_SECONDS
                  ? lang === 'es'
                    ? ' · casi listo'
                    : ' · almost there'
                  : ''}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  if (stage === 'error') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <BackButton onPress={() => setStage('idle')} />
            <Text style={styles.title}>{lang === 'es' ? 'No pudimos leer el PDF' : "We couldn't read the PDF"}</Text>
            <Text style={styles.sub}>{errorMsg}</Text>
          </View>
          <View style={styles.section}>
            <Pressable onPress={() => setStage('idle')} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{lang === 'es' ? 'Intentar de nuevo' : 'Try again'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (stage === 'review' && fields) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.top}>
            <BackButton onPress={backFromReview} />
            <Text style={styles.title}>{lang === 'es' ? 'Revisa lo que leímos' : 'Check what we read'}</Text>
            <Text style={styles.sub}>
              {lang === 'es'
                ? 'Corrige lo que haga falta. Al guardar, se crea o actualiza la tarjeta y sus transacciones.'
                : 'Fix anything that looks off. Saving creates or updates the card and its transactions.'}
            </Text>
            {!!fields.notes && (
              <View style={styles.noteBanner}>
                <Text style={styles.noteBannerText}>{fields.notes}</Text>
              </View>
            )}
            {!!statementId && (
              <Pressable
                onPress={() => openStatementPdf(statementId)}
                disabled={openingStatementId === statementId}
                style={styles.viewPdfLink}
                hitSlop={6}
              >
                {openingStatementId === statementId ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.viewPdfLinkText}>
                    {lang === 'es' ? 'Ver PDF original ↗' : 'View original PDF ↗'}
                  </Text>
                )}
              </Pressable>
            )}
          </View>

          <View style={styles.section}>{renderMatchBanner()}</View>

          <View style={styles.section}>
            <Text style={styles.label}>{lang === 'es' ? 'BANCO' : 'BANK'}</Text>
            <TextInput
              value={fields.bank}
              onChangeText={(v) => setField('bank', v)}
              style={styles.input}
              placeholderTextColor={colors.ink3}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{lang === 'es' ? 'PRODUCTO' : 'PRODUCT'}</Text>
                <TextInput
                  value={fields.product ?? ''}
                  onChangeText={(v) => setField('product', v)}
                  style={styles.input}
                  placeholderTextColor={colors.ink3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{lang === 'es' ? 'ÚLTIMOS 4' : 'LAST 4'}</Text>
                <TextInput
                  value={fields.last4 ?? ''}
                  onChangeText={(v) => setField('last4', v.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.input}
                  placeholderTextColor={colors.ink3}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{lang === 'es' ? 'SALDO' : 'BALANCE'}</Text>
                <TextInput
                  value={String(fields.balance ?? '')}
                  onChangeText={(v) => setField('balance', parseFloat(numeric(v)) || 0)}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  placeholderTextColor={colors.ink3}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{lang === 'es' ? 'PAGO MÍNIMO' : 'MINIMUM PAYMENT'}</Text>
                <TextInput
                  value={String(fields.minimum_payment ?? '')}
                  onChangeText={(v) => setField('minimum_payment', parseFloat(numeric(v)) || 0)}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  placeholderTextColor={colors.ink3}
                />
              </View>
            </View>

            <Text style={styles.label}>{lang === 'es' ? 'LÍMITE DE CRÉDITO' : 'CREDIT LIMIT'}</Text>
            <TextInput
              value={String(fields.credit_limit ?? '')}
              onChangeText={(v) => setField('credit_limit', parseFloat(numeric(v)) || 0)}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={colors.ink3}
            />

            <View style={[styles.row, { marginTop: 20 }]}>
              <DateField
                label={lang === 'es' ? 'FECHA DE CORTE' : 'CUT-OFF DATE'}
                value={fromIso(fields.cutoff_date)}
                onChange={(d) => setField('cutoff_date', toIso(d))}
              />
              <DateField
                label={lang === 'es' ? 'FECHA DE PAGO' : 'PAYMENT DUE DATE'}
                value={fromIso(fields.due_date)}
                onChange={(d) => setField('due_date', toIso(d))}
              />
            </View>

            <Text style={styles.txSummary}>
              {fields.transactions?.length ?? 0}{' '}
              {lang === 'es' ? 'transacciones encontradas' : 'transactions found'}
            </Text>
            {(fields.transactions?.length ?? 0) === 0 && (
              <View style={styles.zeroTxBanner}>
                <Text style={styles.zeroTxBannerText}>
                  {lang === 'es'
                    ? 'No encontramos ninguna transacción en este estado de cuenta. Revisa el PDF antes de guardar — es posible que la lectura se haya saltado algo.'
                    : "We didn't find any transactions in this statement. Check the PDF before saving — the reading may have missed something."}
                </Text>
              </View>
            )}

            <View style={styles.reviewActions}>
              <Pressable onPress={confirmApply} disabled={applying} style={[styles.saveBtn, applying && { opacity: 0.6 }]}>
                {applying ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.saveBtnText}>{lang === 'es' ? 'Guardar en la tarjeta' : 'Save to card'}</Text>
                )}
              </Pressable>
              <Pressable onPress={discardReview} disabled={applying || discarding} style={styles.discardBtn}>
                {discarding ? (
                  <ActivityIndicator color={colors.ink2} />
                ) : (
                  <Text style={styles.discardBtnText}>{lang === 'es' ? 'Descartar' : 'Discard'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
            <Pressable style={styles.pickerSheet} onPress={() => {}}>
              <Text style={styles.pickerTitle}>{lang === 'es' ? 'Elige la tarjeta' : 'Pick the card'}</Text>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                <Pressable
                  style={styles.pickerNewRow}
                  onPress={() => {
                    setChosenCardId(null);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerNewText}>{lang === 'es' ? 'Es una tarjeta nueva' : "It's a new card"}</Text>
                </Pressable>
                {cards.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      setChosenCardId(c.id);
                      setPickerOpen(false);
                    }}
                  >
                    <Text style={styles.pickerRowText}>{c.displayName}</Text>
                    <Text style={styles.pickerRowSub}>
                      {c.bank} {c.product ? `· ${c.product}` : ''} · •••• {c.last4}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <View style={styles.top}>
          <Text style={[styles.title, { marginTop: 0 }]}>
            {lang === 'es' ? 'Agregar un estado de cuenta' : 'Add a statement'}
          </Text>
          <Text style={styles.sub}>
            {lang === 'es'
              ? 'Sube el PDF de tu banco. Si es una tarjeta nueva, la creamos; si ya existe, la actualizamos.'
              : "Upload your bank's PDF. We'll create the card if it's new, or update it if it already exists."}
          </Text>
        </View>

        <View style={styles.section}>
          <Pressable onPress={pickAndUpload} style={styles.uploadBtn}>
            <Text style={styles.uploadBtnTitle}>{lang === 'es' ? 'Subir estado de cuenta (PDF)' : 'Upload statement (PDF)'}</Text>
            <Text style={styles.uploadBtnBody}>
              {lang === 'es'
                ? 'Elígelo desde Archivos o un PDF escaneado.'
                : 'Pick it from Files or a scanned PDF.'}
            </Text>
          </Pressable>

          {!!emailAddress && (
            <View style={styles.emailCard}>
              <Text style={styles.emailTitle}>{t.forward}</Text>
              <Text style={styles.emailBody}>{t.emailBody}</Text>
              <View style={styles.inboxRow}>
                <Text style={styles.inboxText} numberOfLines={1}>
                  {emailAddress}
                </Text>
                <Pressable onPress={copyInbox} style={styles.copyBtn}>
                  <Text style={styles.copyBtnText}>{emailCopied ? t.copied : t.copy}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {history.length > 0 && (
            <>
              <View style={styles.historyHeadRow}>
                <Text style={styles.historyTitle}>
                  {filterCard && !showAllCards
                    ? (lang === 'es' ? `Estados de ${filterCard.displayName}` : `${filterCard.displayName}'s statements`)
                    : (lang === 'es' ? 'Historial' : 'History')}
                </Text>
                {filterCard && (
                  <Pressable onPress={() => setShowAllCards((v) => !v)} hitSlop={8}>
                    <Text style={styles.historyFilterLink}>
                      {showAllCards
                        ? (lang === 'es' ? `Solo ${filterCard.displayName}` : `Only ${filterCard.displayName}`)
                        : (lang === 'es' ? 'Ver todas' : 'View all')}
                    </Text>
                  </Pressable>
                )}
              </View>
              {filterCard && !showAllCards && visibleHistory.length === 0 ? (
                <Text style={styles.historyEmptyNote}>
                  {lang === 'es'
                    ? 'Todavía no hay estados de cuenta guardados para esta tarjeta.'
                    : 'No statements saved for this card yet.'}
                </Text>
              ) : (
              <View style={styles.listCard}>
                {filterCard && !showAllCards
                  ? timeline.map((item) =>
                      item.kind === 'gap' ? (
                        <Pressable
                          key={`gap-${item.monthIso}`}
                          onPress={pickAndUpload}
                          style={[styles.historyRow, styles.historyRowGap]}
                        >
                          <View style={[styles.historyBadge, styles.historyBadgeGap]}>
                            <Ionicons name="add" size={16} color={colors.ink3} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.historyRowTitle} numberOfLines={1}>
                              {fromIso(item.monthIso).toLocaleDateString(lang === 'es' ? 'es-PA' : 'en-US', {
                                month: 'long',
                                year: 'numeric',
                              })}
                            </Text>
                            <Text style={styles.historyRowSub} numberOfLines={1}>
                              {lang === 'es' ? 'Toca para subirlo' : 'Tap to upload'}
                            </Text>
                          </View>
                          <Text style={[styles.historyStatus, { color: colors.ink3 }]}>
                            {lang === 'es' ? 'No subido' : 'Not uploaded'}
                          </Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          key={item.statement.id}
                          disabled={openingStatementId === item.statement.id}
                          onPress={() => handleStatementPress(item.statement)}
                          style={styles.historyRow}
                        >
                          <View style={styles.historyBadge}>
                            {openingStatementId === item.statement.id ? (
                              <ActivityIndicator size="small" color={colors.accentInk} />
                            ) : (
                              <Text style={styles.historyBadgeText}>PDF</Text>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.historyRowTitle} numberOfLines={1}>
                              {item.statement.bank ?? (lang === 'es' ? 'Banco desconocido' : 'Unknown bank')}
                            </Text>
                            <Text style={styles.historyRowSub} numberOfLines={1}>
                              {statementDateLabel(item.statement, lang)}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.historyStatus,
                              {
                                color:
                                  item.statement.status === 'failed'
                                    ? colors.accentInk2
                                    : item.statement.status === 'applied'
                                      ? colors.ink2
                                      : colors.accentInk,
                              },
                            ]}
                          >
                            {statusLabel(item.statement.status, lang)}
                          </Text>
                        </Pressable>
                      ),
                    )
                  : visibleHistory.map((s) => (
                  <Pressable
                    key={s.id}
                    disabled={openingStatementId === s.id}
                    onPress={() => handleStatementPress(s)}
                    style={styles.historyRow}
                  >
                    <View style={styles.historyBadge}>
                      {openingStatementId === s.id ? (
                        <ActivityIndicator size="small" color={colors.accentInk} />
                      ) : (
                        <Text style={styles.historyBadgeText}>PDF</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.historyRowTitle} numberOfLines={1}>
                        {s.bank ?? (lang === 'es' ? 'Banco desconocido' : 'Unknown bank')}
                      </Text>
                      <Text style={styles.historyRowSub} numberOfLines={1}>
                        {statementDateLabel(s, lang)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.historyStatus,
                        { color: s.status === 'failed' ? colors.accentInk2 : s.status === 'applied' ? colors.ink2 : colors.accentInk },
                      ]}
                    >
                      {statusLabel(s.status, lang)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              )}
            </>
          )}

          <Pressable onPress={() => navigation.navigate('AddCard')} style={styles.manualLink} hitSlop={6}>
            <Text style={styles.manualLinkText}>
              {lang === 'es' ? '¿Prefieres agregarla a mano? Agregar tarjeta manualmente' : 'Prefer to enter it by hand? Add a card manually'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function StatementsScreen({ navigation, route }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDemo } = useCards();
  const [stage, setStage] = useState<UploadStage>('idle');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!isDemo) {
    return <RealStatementsFlow navigation={navigation} route={route} />;
  }

  const startParse = () => {
    setStage('parsing');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStage('review'), 1500);
  };

  const copyInbox = async () => {
    await Clipboard.setStringAsync(INBOX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2600);
  };

  const confirmParse = () => {
    setStage('idle');
    Alert.alert(
      lang === 'es' ? 'Banco Aliado actualizado con el estado de septiembre' : 'Banco Aliado updated from the September statement',
    );
    navigation.navigate('CardDetail', { cardId: 'aliado' });
  };

  const title =
    stage === 'review' ? (lang === 'es' ? 'Revisa lo que leímos' : 'Check what we read')
      : stage === 'parsing' ? (lang === 'es' ? 'Leyendo tu estado de cuenta' : 'Reading your statement')
        : (lang === 'es' ? 'Agregar un estado de cuenta' : 'Add a statement');
  const sub =
    stage === 'review'
      ? (lang === 'es' ? 'Estos valores salen del PDF. Confirma y la tarjeta se actualiza.' : 'These values come straight from the PDF. Confirm and the card updates.')
      : stage === 'parsing'
        ? (lang === 'es' ? 'Suele tardar menos de diez segundos. Puedes salir de esta pantalla.' : 'Usually under ten seconds. You can leave this screen.')
        : (lang === 'es' ? 'Dos caminos: envías el PDF, o el correo del banco lo hace por ti.' : 'Two ways in: send the PDF yourself, or let the bank email do it for you.');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          {stage !== 'idle' && <BackButton onPress={() => setStage('idle')} />}
          <Text style={[styles.title, stage === 'idle' && { marginTop: 0 }]}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>

        {stage === 'idle' && (
          <View style={styles.section}>
            <Pressable onPress={startParse} style={styles.uploadBtn}>
              <Text style={styles.uploadBtnTitle}>{t.uploadPdf}</Text>
              <Text style={styles.uploadBtnBody}>{t.uploadBody}</Text>
            </Pressable>

            <View style={styles.emailCard}>
              <Text style={styles.emailTitle}>{t.forward}</Text>
              <Text style={styles.emailBody}>{t.emailBody}</Text>
              <View style={styles.inboxRow}>
                <Text style={styles.inboxText} numberOfLines={1}>
                  {INBOX}
                </Text>
                <Pressable onPress={copyInbox} style={styles.copyBtn}>
                  <Text style={styles.copyBtnText}>{copied ? t.copied : t.copy}</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.historyTitle}>{t.stmtHistory}</Text>
            <View style={styles.listCard}>
              {STATEMENT_HISTORY[lang].map((s) => (
                <Pressable
                  key={s.title}
                  disabled={!s.needsReview}
                  onPress={() => s.needsReview && navigation.navigate('Fix')}
                  style={styles.historyRow}
                >
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>PDF</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.historyRowTitle} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text style={styles.historyRowSub} numberOfLines={1}>
                      {s.sub}
                    </Text>
                  </View>
                  <Text style={[styles.historyStatus, { color: s.accent ? colors.accentInk2 : colors.ink2 }]}>
                    {s.status}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {stage === 'parsing' && (
          <View style={[styles.section, { gap: 10 }]}>
            {PARSE_STEPS[lang].map((p) => (
              <View key={p.label} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepMark,
                    { borderColor: p.done ? colors.accentLine : colors.line },
                  ]}
                >
                  <Text style={[styles.stepMarkText, { color: p.done ? colors.accentInk : colors.ink2 }]}>
                    {p.mark}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, { color: p.done ? colors.accentInk : colors.ink2 }]}>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {stage === 'review' && (
          <View style={styles.section}>
            <View style={styles.matchBanner}>
              <View style={styles.matchThumb} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.matchTitle}>Banco Aliado · Visa Infinite</Text>
                <Text style={styles.matchSub}>Matched by last 4 digits · 1675</Text>
              </View>
            </View>

            <View style={styles.listCard}>
              {PARSED_FIELDS[lang].map((f) => (
                <View key={f.label} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <View style={styles.fieldValueRow}>
                    <Text style={styles.fieldValue}>{f.value}</Text>
                    <View
                      style={[
                        styles.chip,
                        { backgroundColor: f.ok ? colors.tint : colors.line },
                      ]}
                    >
                      <Text style={[styles.chipText, { color: f.ok ? colors.accentInk : colors.tintInk2 }]}>
                        {f.ok ? (lang === 'es' ? 'Leído' : 'Parsed') : (lang === 'es' ? 'Revisar' : 'Check')}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.tapNote}>{t.tapCorrect}</Text>
            <View style={styles.reviewActions}>
              <Pressable onPress={confirmParse} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>{t.saveToCard}</Text>
              </Pressable>
              <Pressable onPress={() => setStage('idle')} style={styles.discardBtn}>
                <Text style={styles.discardBtnText}>{t.discard}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const STATEMENT_HISTORY: Record<
  'en' | 'es',
  { title: string; sub: string; status: string; accent: boolean; needsReview?: boolean }[]
> = {
  en: [
    { title: 'Banco Aliado · August', sub: 'New layout · we could not read it', status: 'Needs review', accent: true, needsReview: true },
    { title: 'Banco Aliado · September', sub: 'Forwarded by email · 2 min ago', status: 'New', accent: true },
    { title: 'BAC · September', sub: 'Uploaded PDF · 5 Sep', status: 'Applied', accent: false },
    { title: 'Davibank · September', sub: 'Forwarded by email · 8 Sep', status: 'Applied', accent: false },
    { title: 'BAC Platinum · August', sub: 'Uploaded PDF · 6 Aug', status: 'Applied', accent: false },
  ],
  es: [
    { title: 'Banco Aliado · agosto', sub: 'Formato nuevo · no pudimos leerlo', status: 'Revisar', accent: true, needsReview: true },
    { title: 'Banco Aliado · septiembre', sub: 'Reenviado por correo · hace 2 min', status: 'Nuevo', accent: true },
    { title: 'BAC · septiembre', sub: 'PDF subido · 5 sep', status: 'Aplicado', accent: false },
    { title: 'Davibank · septiembre', sub: 'Reenviado por correo · 8 sep', status: 'Aplicado', accent: false },
    { title: 'BAC Platinum · agosto', sub: 'PDF subido · 6 ago', status: 'Aplicado', accent: false },
  ],
};

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18, maxWidth: 320 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    parseProgressRow: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    parseProgressPct: { fontSize: 13, fontWeight: '600', color: colors.ink },
    parseProgressTime: { fontSize: 12, color: colors.ink3 },
    uploadBtn: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.accentLine,
      borderRadius: radius.xl,
      backgroundColor: colors.surface2,
      padding: 22,
    },
    uploadBtnTitle: { fontSize: 15, fontWeight: '500', color: colors.accentInk },
    uploadBtnBody: { fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
    emailCard: {
      marginTop: 12,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    emailTitle: { fontSize: 14, fontWeight: '500', color: colors.ink },
    emailBody: { fontSize: 12, color: colors.ink2, marginTop: 6, lineHeight: 17 },
    inboxRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 11,
      borderRadius: radius.md - 2,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    inboxText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.accentInk },
    copyBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    copyBtnText: { fontSize: 11, fontWeight: '500', color: colors.accent },
    historyTitle: { fontSize: 16, fontWeight: '500', color: colors.ink, marginTop: 22 },
    historyHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    historyFilterLink: { fontSize: 12, fontWeight: '500', color: colors.accent, marginTop: 22 },
    historyEmptyNote: { fontSize: 12.5, color: colors.ink3, marginTop: 10, lineHeight: 18 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    historyRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    historyRowGap: { opacity: 0.85 },
    historyBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm + 1,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyBadgeGap: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
    },
    historyBadgeText: { fontSize: 10, fontWeight: '600', color: colors.accentInk },
    historyRowTitle: { fontSize: 13, fontWeight: '500', color: colors.ink },
    historyRowSub: { fontSize: 11, color: colors.ink3, marginTop: 2 },
    historyStatus: { fontSize: 11, fontWeight: '500' },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    stepMark: {
      width: 22,
      height: 22,
      borderRadius: 999,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepMarkText: { fontSize: 11, fontWeight: '600' },
    stepLabel: { fontSize: 13 },
    matchBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    matchThumb: { width: 46, height: 30, borderRadius: 5, backgroundColor: '#2e4a7d' },
    matchTitle: { fontSize: 13, fontWeight: '500', color: colors.onArt },
    matchSub: { fontSize: 11, color: colors.accentInk, marginTop: 3 },
    fieldRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    fieldLabel: { fontSize: 12.5, color: colors.ink2b, flexShrink: 1 },
    fieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    fieldValue: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
    chip: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 999 },
    chipText: { fontSize: 9.5, fontWeight: '500' },
    tapNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10, lineHeight: 16 },
    reviewActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
    saveBtn: {
      flex: 1,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    saveBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.accent },
    discardBtn: {
      paddingVertical: 13,
      paddingHorizontal: 15,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    discardBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.ink },
    label: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1, marginTop: 18 },
    input: {
      marginTop: 10,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 14,
    },
    row: { flexDirection: 'row', gap: 12 },
    txSummary: { fontSize: 12.5, color: colors.ink2, marginTop: 18 },
    noteBanner: {
      marginTop: 14,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    noteBannerText: { fontSize: 12, color: colors.ink2, lineHeight: 17 },
    viewPdfLink: { marginTop: 14, alignSelf: 'flex-start' },
    viewPdfLinkText: { fontSize: 12.5, fontWeight: '500', color: colors.accent },
    zeroTxBanner: {
      marginTop: 10,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    zeroTxBannerText: { fontSize: 12, color: colors.accentInk, lineHeight: 17 },
    manualLink: { marginTop: 18, alignItems: 'center' },
    manualLinkText: { fontSize: 12, color: colors.accent, fontWeight: '500' },
    matchInlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: 13,
      borderRadius: radius.lg,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    matchInlineTitle: { fontSize: 12.5, fontWeight: '500', color: colors.accentInk, flex: 1 },
    matchInlineSub: { fontSize: 11.5, color: colors.accentInk2 },
    matchInlineLink: { fontSize: 12, fontWeight: '600', color: colors.accent },
    renewalBanner: {
      padding: 13,
      borderRadius: radius.lg,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    renewalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    renewalYes: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.sm + 2,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    renewalYesText: { fontSize: 12.5, fontWeight: '500', color: colors.accent },
    renewalNo: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radius.sm + 2,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    renewalNoText: { fontSize: 12.5, fontWeight: '500', color: colors.ink2 },
    candidateRow: {
      padding: 11,
      borderRadius: radius.sm + 2,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    candidateText: { fontSize: 12.5, fontWeight: '500', color: colors.ink },
    pickerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
      paddingBottom: spacing.xxl,
    },
    pickerTitle: { fontSize: 17, fontWeight: '600', color: colors.ink, marginBottom: 12 },
    pickerNewRow: {
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.accentLine,
      marginBottom: 8,
    },
    pickerNewText: { fontSize: 13, fontWeight: '500', color: colors.accentInk },
    pickerRow: {
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 8,
    },
    pickerRowText: { fontSize: 13, fontWeight: '500', color: colors.ink },
    pickerRowSub: { fontSize: 11, color: colors.ink3, marginTop: 3 },
  });
}
