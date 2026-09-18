import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import { DateField } from '../components/DateField';
import { useCards } from '../context/CardsContext';
import { useAuth } from '../context/AuthContext';
import {
  readPdfForUpload,
  findStatementByHash,
  uploadStatementPdf,
  parseStatement,
  applyStatement,
  listNeedsReviewStatements,
} from '../supabase/statementsApi';
import { DbStatement, ParsedStatement } from '../supabase/types';

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

function RealStatementsFlow({ navigation }: any) {
  const { lang } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { session } = useAuth();
  const { refresh } = useCards();
  const userId = session?.user.id;

  const [stage, setStage] = useState<RealStage>('idle');
  const [statementId, setStatementId] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedStatement | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [applying, setApplying] = useState(false);
  const [history, setHistory] = useState<DbStatement[]>([]);

  const loadHistory = async () => {
    if (!userId) return;
    try {
      setHistory(await listNeedsReviewStatements(userId));
    } catch {
      // Non-critical: history is a nice-to-have, not worth surfacing an error for.
    }
  };

  useEffect(() => {
    loadHistory();
  }, [userId]);

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
      setStatementId(statement.id);
      setStage('parsing');
      const parsed = await parseStatement(statement.id);
      setFields(parsed);
      setStage('review');
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
      setStage('error');
    } finally {
      loadHistory();
    }
  };

  const resumeReview = (s: DbStatement) => {
    if (s.status !== 'needs_review' || !s.parsed) return;
    setStatementId(s.id);
    setFields(s.parsed);
    setStage('review');
  };

  const confirmApply = async () => {
    if (!statementId || !fields) return;
    setApplying(true);
    try {
      const result = await applyStatement(statementId, fields);
      await refresh();
      setStage('idle');
      setStatementId(null);
      setFields(null);
      navigation.navigate('CardDetail', { cardId: result.cardId });
    } catch (err: any) {
      Alert.alert(lang === 'es' ? 'No se pudo guardar' : 'Could not save', err?.message ?? String(err));
    } finally {
      setApplying(false);
      loadHistory();
    }
  };

  const discardReview = () => {
    setStage('idle');
    setStatementId(null);
    setFields(null);
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
            {lang === 'es' ? 'Esto puede tardar unos segundos.' : 'This can take a few seconds.'}
          </Text>
        </View>
        <View style={[styles.section, { alignItems: 'center', paddingTop: 30 }]}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'error') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <BackButton onPress={discardReview} />
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
          </View>

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

            <View style={styles.reviewActions}>
              <Pressable onPress={confirmApply} disabled={applying} style={[styles.saveBtn, applying && { opacity: 0.6 }]}>
                {applying ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.saveBtnText}>{lang === 'es' ? 'Guardar en la tarjeta' : 'Save to card'}</Text>
                )}
              </Pressable>
              <Pressable onPress={discardReview} disabled={applying} style={styles.discardBtn}>
                <Text style={styles.discardBtnText}>{lang === 'es' ? 'Descartar' : 'Discard'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

          {history.length > 0 && (
            <>
              <Text style={styles.historyTitle}>{lang === 'es' ? 'Historial' : 'History'}</Text>
              <View style={styles.listCard}>
                {history.map((s) => (
                  <Pressable
                    key={s.id}
                    disabled={s.status !== 'needs_review'}
                    onPress={() => resumeReview(s)}
                    style={styles.historyRow}
                  >
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>PDF</Text>
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

export function StatementsScreen({ navigation }: any) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isDemo } = useCards();
  const [stage, setStage] = useState<UploadStage>('idle');
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!isDemo) {
    return <RealStatementsFlow navigation={navigation} />;
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
    historyBadge: {
      width: 34,
      height: 34,
      borderRadius: radius.sm + 1,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
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
    manualLink: { marginTop: 18, alignItems: 'center' },
    manualLinkText: { fontSize: 12, color: colors.accent, fontWeight: '500' },
  });
}
