import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { radius, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useCards } from '../context/CardsContext';
import { BackButton } from '../components/BackButton';
import { money } from '../format';
import {
  AdvisorError,
  AdvisorMessage,
  AdvisorStatus,
  askAdvisor,
  getAdvisorStatus,
  giveConsent,
  loadLatestConversation,
  rateMessage,
} from '../supabase/advisorApi';

type Mode = 'loading' | 'error' | 'off' | 'consent' | 'chat' | 'limit';

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function firstOfNextMonth(es: boolean): string {
  const d = new Date();
  const m = (d.getMonth() + 1) % 12;
  return es ? `1 de ${MONTHS_ES[m]}` : `${MONTHS_EN[m]} 1`;
}

function daysUntil(iso: string): number {
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, mo, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, mo - 1, d) - t) / 86400000);
}

export function AdvisorScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang } = useLocale();
  const es = lang === 'es';
  const { cards } = useCards();

  const [mode, setMode] = useState<Mode>('loading');
  const [status, setStatus] = useState<AdvisorStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const s = await getAdvisorStatus();
      setStatus(s);
      if (!s.enabled) return setMode('off');
      if (!s.consented) return setMode('consent');
      const conv = await loadLatestConversation();
      if (conv) {
        setConversationId(conv.id);
        setMessages(conv.messages);
      }
      setMode(s.usedMonth >= s.monthlyLimit ? 'limit' : 'chat');
    } catch {
      setMode('error');
    }
  }, []);

  // Re-check on focus: consent can be revoked from the memory screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [messages.length, sending]);

  // Proactive opener: the nearest unpaid deadline in the next 7 days.
  const opener = useMemo(() => {
    const upcoming = cards
      .filter((c) => !c.paid && c.nextDueIso)
      .map((c) => ({ c, days: daysUntil(c.nextDueIso!) }))
      .filter((x) => x.days >= 0 && x.days <= 7)
      .sort((a, b) => a.days - b.days)[0];
    if (!upcoming) return null;
    const { c, days } = upcoming;
    const when = es
      ? days === 0 ? 'vence hoy' : days === 1 ? 'vence mañana' : `vence en ${days} días`
      : days === 0 ? 'is due today' : days === 1 ? 'is due tomorrow' : `is due in ${days} days`;
    const full = money(c.cur, c.fullAmount ?? c.balance);
    const min = money(c.cur, c.min);
    return {
      cardId: c.id,
      name: c.displayName,
      when,
      rest: es
        ? `Si pagas el total de ${full} no pagas intereses. Con el mínimo de ${min} quedas al día, pero te cobran intereses sobre el resto.`
        : `Paying the full ${full} means no interest. The minimum of ${min} keeps you current, but you'll pay interest on the rest.`,
    };
  }, [cards, es]);

  const suggestions = es
    ? ['¿Qué tarjeta pago primero?', '¿En qué gasté más este mes?', '¿Cuánto he pagado en intereses?', 'Arma mi presupuesto']
    : ['Which card should I pay first?', 'What did I spend the most on this month?', 'How much have I paid in interest?', 'Build my budget'];

  const errorText = (e: unknown): string => {
    const code = e instanceof AdvisorError ? e.code : 'network';
    switch (code) {
      case 'daily_limit':
        return es ? 'Llegaste al límite de preguntas de hoy. Vuelve mañana.' : "You've reached today's question limit. Come back tomorrow.";
      case 'message_too_long':
        return es ? 'La pregunta es muy larga (máximo 1,000 caracteres).' : 'That question is too long (1,000 characters max).';
      case 'ai_unavailable':
        return es ? 'El Asesor no está disponible en este momento. Intenta de nuevo en un rato.' : "The advisor isn't available right now. Try again in a bit.";
      default:
        return es ? 'No pudimos enviar tu pregunta. Revisa tu conexión e intenta de nuevo.' : "We couldn't send your question. Check your connection and try again.";
    }
  };

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setNotice(null);
    setInput('');
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: 'user', content: q, rating: null, created_at: new Date().toISOString() }]);
    setSending(true);
    try {
      const r = await askAdvisor(q, conversationId, lang);
      setConversationId(r.conversationId);
      setMessages((m) => [
        ...m,
        { id: r.messageId, role: 'assistant', content: r.answer, rating: null, created_at: new Date().toISOString() },
      ]);
      setStatus((s) => (s ? { ...s, usedMonth: s.monthlyLimit - r.remaining.month } : s));
      if (r.remaining.month <= 0) setMode('limit');
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      if (e instanceof AdvisorError && e.code === 'monthly_limit') {
        setStatus((s) => (s ? { ...s, usedMonth: s.monthlyLimit } : s));
        setMode('limit');
      } else if (e instanceof AdvisorError && e.code === 'no_consent') {
        setMode('consent');
      } else {
        setInput(q);
        setNotice(errorText(e));
      }
    } finally {
      setSending(false);
    }
  };

  const rate = (id: string, value: -1 | 1) => {
    const msg = messages.find((m) => m.id === id);
    const next = msg?.rating === value ? null : value;
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, rating: next } : x)));
    rateMessage(id, next).catch(() => {});
  };

  const accept = async () => {
    setAccepting(true);
    try {
      await giveConsent();
      await load();
    } catch {
      setNotice(es ? 'No pudimos guardar tu permiso. Intenta de nuevo.' : "We couldn't save your consent. Try again.");
    } finally {
      setAccepting(false);
    }
  };

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'));

  // ——— Header (chat + limit) ———
  const header = (
    <View style={styles.header}>
      <BackButton onPress={goBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.hTitle}>{es ? 'Asesor Poquet' : 'Poquet Advisor'}</Text>
        {status && (
          <Text style={styles.hSub}>
            {es
              ? `${status.usedMonth} de ${status.monthlyLimit} preguntas este mes`
              : `${status.usedMonth} of ${status.monthlyLimit} questions this month`}
          </Text>
        )}
      </View>
      <Pressable style={styles.memoryPill} onPress={() => navigation.navigate('AdvisorMemory')} accessibilityRole="button">
        <Ionicons name="bookmark-outline" size={14} color={colors.ink2} />
        <Text style={styles.memoryPillText}>{es ? 'Memoria' : 'Memory'}</Text>
      </Pressable>
    </View>
  );

  if (mode === 'loading') {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.ink3} />
      </SafeAreaView>
    );
  }

  if (mode === 'off') {
    // Not enabled for this account yet: a teaser instead of a dead end. Access
    // is decided server-side (advisor_access), so the button can show for
    // everyone while only enabled accounts reach the chat.
    const examples = es
      ? ['¿Cuánto gasté en restaurantes este mes?', '¿Qué tarjeta me conviene pagar primero?', '¿Cuánto pagué en intereses este año?']
      : ['How much did I spend on dining this month?', 'Which card should I pay first?', 'How much interest did I pay this year?'];
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.simpleTop}>
          <BackButton onPress={goBack} />
        </View>
        <ScrollView contentContainerStyle={styles.consentScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.consentIcon}>
            <Ionicons name="sparkles" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.groupLabel, { marginTop: 18 }]}>{es ? 'MUY PRONTO' : 'COMING SOON'}</Text>
          <Text style={styles.consentTitle}>{es ? 'Tu Asesor Poquet' : 'Your Poquet Advisor'}</Text>
          <Text style={[styles.body, { marginTop: 8 }]}>
            {es
              ? 'Un asistente con IA que conoce tus tarjetas y te responde con tus propios números: gastos, pagos, intereses y cuotas.'
              : 'An AI assistant that knows your cards and answers with your own numbers: spending, payments, interest and installments.'}
          </Text>
          <View style={{ marginTop: 20, gap: 8 }}>
            {examples.map((q) => (
              <View key={q} style={styles.teaserBubble}>
                <Text style={styles.teaserText}>{q}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.body, { marginTop: 20, color: colors.ink3 }]}>
            {es
              ? 'Lo estamos probando con un grupo pequeño. Te avisaremos cuando esté listo para ti.'
              : "We're testing it with a small group. We'll let you know when it's ready for you."}
          </Text>
          <Pressable style={[styles.primaryBtn, { marginTop: 24 }]} onPress={goBack}>
            <Text style={styles.primaryBtnText}>{es ? 'Entendido' : 'Got it'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'error') {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.simpleTop}>
          <BackButton onPress={goBack} />
        </View>
        <View style={[styles.center, { flex: 1, paddingHorizontal: 32 }]}>
          <Ionicons name="sparkles-outline" size={34} color={colors.ink3} />
          <Text style={[styles.consentTitle, { textAlign: 'center', marginTop: 16 }]}>
            {es ? 'No pudimos abrir el Asesor' : "We couldn't open the advisor"}
          </Text>
          <Text style={[styles.body, { textAlign: 'center', marginTop: 8 }]}>
            {es ? 'Revisa tu conexión e intenta de nuevo.' : 'Check your connection and try again.'}
          </Text>
          <Pressable style={[styles.primaryBtn, { marginTop: 20, alignSelf: 'stretch' }]} onPress={() => { setMode('loading'); load(); }}>
            <Text style={styles.primaryBtnText}>{es ? 'Reintentar' : 'Retry'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'consent') {
    const Item = ({ ok, text }: { ok: boolean; text: string }) => (
      <View style={styles.consentItem}>
        <Ionicons name={ok ? 'checkmark' : 'close'} size={16} color={ok ? colors.ink : colors.ink3} style={{ marginTop: 1 }} />
        <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
      </View>
    );
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.simpleTop}>
          <BackButton onPress={goBack} />
        </View>
        <ScrollView contentContainerStyle={styles.consentScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.consentIcon}>
            <Ionicons name="sparkles" size={26} color={colors.accent} />
          </View>
          <Text style={styles.consentTitle}>{es ? 'Conoce a tu Asesor Poquet' : 'Meet your Poquet Advisor'}</Text>
          <Text style={[styles.body, { marginTop: 8 }]}>
            {es
              ? 'Te ayuda a entender tus gastos, pagos e intereses con los datos de tus tarjetas. Es educativo: no reemplaza a un asesor financiero y puede equivocarse.'
              : 'It helps you understand your spending, payments and interest using your card data. It is educational: it does not replace a financial advisor and can make mistakes.'}
          </Text>
          <View style={styles.consentBox}>
            <Text style={styles.groupLabel}>
              {es ? 'COMPARTIMOS CON ANTHROPIC, NUESTRO PROVEEDOR DE IA' : 'WE SHARE WITH ANTHROPIC, OUR AI PROVIDER'}
            </Text>
            <Item ok text={es ? 'Tu pregunta y la conversación en curso' : 'Your question and the current conversation'} />
            <Item ok text={es ? 'Montos, fechas y categorías de tus tarjetas, calculados para responder' : 'Amounts, dates and categories from your cards, computed to answer'} />
            <Item ok text={es ? 'Las metas que le pidas recordar' : 'The goals you ask it to remember'} />
          </View>
          <View style={styles.consentBox}>
            <Text style={styles.groupLabel}>{es ? 'NUNCA COMPARTIMOS' : 'WE NEVER SHARE'}</Text>
            <Item ok={false} text={es ? 'Tu nombre, correo, números de tarjeta ni tus estados de cuenta' : 'Your name, email, card numbers or your statements'} />
            <Item ok={false} text={es ? 'Tus datos para entrenar inteligencia artificial' : 'Your data to train artificial intelligence'} />
          </View>
          <Text style={[styles.small, { marginTop: 14 }]}>
            {es
              ? 'Puedes ver y borrar lo que el Asesor recuerda, y retirar este permiso cuando quieras desde "Memoria" dentro del Asesor.'
              : 'You can see and delete what the advisor remembers, and withdraw this permission anytime from "Memory" inside the advisor.'}
          </Text>
          <Text style={[styles.small, { marginTop: 10 }]}>
            {es ? 'Al aceptar, aceptas también nuestros ' : 'By accepting you also agree to our '}
            <Text
              style={{ textDecorationLine: 'underline', color: colors.ink2 }}
              onPress={() => Linking.openURL(es ? 'https://poquetapp.com/terminos/' : 'https://poquetapp.com/en/terms/').catch(() => {})}
            >
              {es ? 'Términos' : 'Terms'}
            </Text>
            {es ? ' y la ' : ' and the '}
            <Text
              style={{ textDecorationLine: 'underline', color: colors.ink2 }}
              onPress={() => Linking.openURL(es ? 'https://poquetapp.com/privacidad/' : 'https://poquetapp.com/en/privacy/').catch(() => {})}
            >
              {es ? 'Política de privacidad' : 'Privacy policy'}
            </Text>
            .
          </Text>
          {!!notice && <Text style={[styles.small, { marginTop: 10, color: colors.ink }]}>{notice}</Text>}
        </ScrollView>
        <View style={styles.consentActions}>
          <Pressable style={styles.primaryBtn} onPress={accept} disabled={accepting} accessibilityRole="button">
            {accepting ? (
              <ActivityIndicator color={colors.onTint2} />
            ) : (
              <Text style={styles.primaryBtnText}>{es ? 'Aceptar y continuar' : 'Accept and continue'}</Text>
            )}
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={goBack} accessibilityRole="button">
            <Text style={styles.ghostBtnText}>{es ? 'Ahora no' : 'Not now'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'limit') {
    const LinkRow = ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable style={styles.linkRow} onPress={onPress}>
        <Text style={styles.linkRowText}>{label}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
      </Pressable>
    );
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.groupLabel}>{es ? 'PREGUNTAS DE ESTE MES' : 'QUESTIONS THIS MONTH'}</Text>
          <Text style={styles.limitBig}>
            {status?.monthlyLimit ?? 100} {es ? 'de' : 'of'} {status?.monthlyLimit ?? 100}
          </Text>
          <View style={styles.limitBar}>
            <View style={[styles.limitFill, { backgroundColor: colors.bar }]} />
          </View>
          <Text style={[styles.small, { marginTop: 8 }]}>
            {es ? `Tu cupo se renueva el ${firstOfNextMonth(true)}.` : `Your allowance renews on ${firstOfNextMonth(false)}.`}
          </Text>
          <View style={[styles.consentBox, { marginTop: 20 }]}>
            <Text style={styles.consentItemTitle}>{es ? 'Usaste todas tus preguntas del mes' : 'You used all your questions this month'}</Text>
            <Text style={[styles.body, { marginTop: 6 }]}>
              {es
                ? 'Mientras tanto, todo lo demás de Poquet sigue funcionando: tus tarjetas, pagos, calendario y análisis.'
                : 'Meanwhile, everything else in Poquet keeps working: your cards, payments, calendar and insights.'}
            </Text>
          </View>
          <View style={[styles.card, { marginTop: 16 }]}>
            <LinkRow label={es ? 'Ver análisis de gastos' : 'See spending insights'} onPress={() => navigation.navigate('Tabs', { screen: 'Insights' })} />
            <View style={styles.sep} />
            <LinkRow label={es ? 'Ver próximos pagos' : 'See upcoming payments'} onPress={() => navigation.navigate('Tabs', { screen: 'Calendar' })} />
            {messages.length > 0 && (
              <>
                <View style={styles.sep} />
                <LinkRow label={es ? 'Leer tu conversación' : 'Read your conversation'} onPress={() => setMode('chat')} />
              </>
            )}
          </View>
          <Pressable style={[styles.primaryBtn, { marginTop: 24 }]} onPress={goBack}>
            <Text style={styles.primaryBtnText}>{es ? 'Entendido' : 'Got it'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ——— Chat ———
  const limitReached = !!status && status.usedMonth >= status.monthlyLimit;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {opener ? (
            <View style={styles.botBubble}>
              <Text style={styles.bubbleText}>
                <Text style={{ fontWeight: '700' }}>
                  {opener.name} {opener.when}
                </Text>
                {'. '}
                {opener.rest}
              </Text>
              <Pressable onPress={() => navigation.navigate('CardDetail', { cardId: opener.cardId })} style={{ marginTop: 10 }}>
                <Text style={styles.openerLink}>
                  {es ? 'Ver' : 'See'} {opener.name} →
                </Text>
              </Pressable>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.botBubble}>
              <Text style={styles.bubbleText}>
                {es
                  ? 'Hola. Pregúntame sobre tus gastos, pagos, intereses o cuotas, y te respondo con los datos de tus tarjetas.'
                  : 'Hi. Ask me about your spending, payments, interest or installments, and I will answer with your card data.'}
              </Text>
            </View>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={styles.userBubble}>
                <Text style={styles.bubbleText}>{m.content}</Text>
              </View>
            ) : (
              <View key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
                <View style={[styles.botBubble, { maxWidth: '100%' }]}>
                  <Text style={styles.bubbleText} selectable>
                    {m.content}
                  </Text>
                </View>
                <View style={styles.rateRow}>
                  <Pressable onPress={() => rate(m.id, 1)} hitSlop={6} style={styles.rateBtn} accessibilityLabel={es ? 'Útil' : 'Helpful'}>
                    <Ionicons name={m.rating === 1 ? 'thumbs-up' : 'thumbs-up-outline'} size={16} color={m.rating === 1 ? colors.ink : colors.ink3} />
                  </Pressable>
                  <Pressable onPress={() => rate(m.id, -1)} hitSlop={6} style={styles.rateBtn} accessibilityLabel={es ? 'No útil' : 'Not helpful'}>
                    <Ionicons name={m.rating === -1 ? 'thumbs-down' : 'thumbs-down-outline'} size={16} color={m.rating === -1 ? colors.ink : colors.ink3} />
                  </Pressable>
                </View>
              </View>
            ),
          )}

          {sending && (
            <View style={[styles.botBubble, styles.thinking]}>
              <ActivityIndicator size="small" color={colors.ink3} />
              <Text style={[styles.small, { marginLeft: 8 }]}>{es ? 'Revisando tus datos…' : 'Checking your data…'}</Text>
            </View>
          )}
        </ScrollView>

        {!!notice && (
          <View style={styles.notice}>
            <Text style={[styles.small, { color: colors.ink, flex: 1 }]}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.ink3} />
            </Pressable>
          </View>
        )}

        {!sending && !limitReached && (
          <ScrollView horizontal style={styles.chipsBar} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={limitReached ? (es ? 'Sin preguntas este mes' : 'No questions left this month') : es ? 'Pregunta' : 'Ask'}
            placeholderTextColor={colors.ink3}
            maxLength={1000}
            multiline
            editable={!limitReached}
            accessibilityLabel={es ? 'Escribe tu pregunta' : 'Type your question'}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending || limitReached) && { opacity: 0.4 }]}
            onPress={() => send()}
            disabled={!input.trim() || sending || limitReached}
            accessibilityRole="button"
            accessibilityLabel={es ? 'Enviar' : 'Send'}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onTint2} />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>
          {es ? 'Respuestas generadas con IA. Educativo, no es asesoría financiera; puede equivocarse.' : 'AI-generated answers. Educational, not financial advice; it can make mistakes.'}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    teaserBubble: {
      alignSelf: 'flex-start',
      maxWidth: '90%',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      borderBottomLeftRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    teaserText: { fontSize: 13.5, color: colors.ink },
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line2,
    },
    simpleTop: { paddingHorizontal: 16, paddingTop: 8 },
    hTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
    hSub: { fontSize: 12, color: colors.ink3, marginTop: 1 },
    memoryPill: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    memoryPillText: { fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
    thread: { padding: 16, gap: 14 },
    botBubble: {
      alignSelf: 'flex-start',
      maxWidth: '88%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomLeftRadius: 6,
      padding: 14,
    },
    userBubble: {
      alignSelf: 'flex-end',
      maxWidth: '80%',
      backgroundColor: colors.tint,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 6,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    bubbleText: { fontSize: 14, lineHeight: 21, color: colors.ink },
    openerLink: { fontSize: 13, fontWeight: '700', color: colors.ink },
    thinking: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    rateRow: { flexDirection: 'row', gap: 6, paddingLeft: 4, marginTop: 4 },
    rateBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    notice: {
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    // A horizontal ScrollView in a flex column stretches to fill the free
    // height unless told not to grow — that's what made the chips huge.
    chipsBar: { flexGrow: 0, flexShrink: 0 },
    chips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'center' },
    chip: {
      height: 36,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
    input: {
      flex: 1,
      minHeight: 50,
      maxHeight: 120,
      paddingHorizontal: 16,
      paddingTop: 15,
      paddingBottom: 13,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 14.5,
    },
    sendBtn: {
      width: 50,
      height: 50,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disclaimer: { textAlign: 'center', fontSize: 11, color: colors.ink3, paddingBottom: 6, paddingHorizontal: 16 },
    // consent / limit
    consentScroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
    consentIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    consentTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, letterSpacing: -0.3 },
    body: { fontSize: 14, lineHeight: 21, color: colors.ink2 },
    small: { fontSize: 12, lineHeight: 17, color: colors.ink3 },
    groupLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: colors.ink3, marginBottom: 10 },
    consentBox: {
      marginTop: 16,
      padding: 14,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    consentItem: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    consentItemTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
    consentActions: { paddingHorizontal: 24, paddingBottom: 8, gap: 8 },
    primaryBtn: {
      minHeight: 52,
      borderRadius: radius.lg,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.onTint2 },
    ghostBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    ghostBtnText: { fontSize: 14.5, fontWeight: '600', color: colors.ink2 },
    limitBig: { fontFamily: fonts.display, fontSize: 34, color: colors.ink },
    limitBar: { height: 8, borderRadius: 4, backgroundColor: colors.line2, marginTop: 10, overflow: 'hidden' },
    limitFill: { width: '100%', height: '100%' },
    card: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
    linkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 14 },
    linkRowText: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.ink },
    sep: { height: 1, backgroundColor: colors.line },
  });
}
