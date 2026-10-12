import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { BackButton } from '../components/BackButton';
import {
  AdvisorMemoryItem,
  MemoryKind,
  addMemory,
  deleteAllConversations,
  deleteAllMemory,
  deleteMemory,
  listMemory,
  revokeConsent,
} from '../supabase/advisorApi';

const KINDS: MemoryKind[] = ['goal', 'preference', 'event'];

// "What Poquet knows about you": only what the user told the advisor to
// remember. Everything here can be deleted; consent can be withdrawn.
export function AdvisorMemoryScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang } = useLocale();
  const es = lang === 'es';

  const [items, setItems] = useState<AdvisorMemoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<MemoryKind>('goal');
  const [saving, setSaving] = useState(false);

  // Each kind with what it's for and an example, so the user knows which to pick.
  const labels: Record<MemoryKind, { group: string; chip: string; hint: string; example: string }> = es
    ? {
        goal: {
          group: 'METAS',
          chip: 'Meta',
          hint: 'Algo que quieres lograr con tu dinero. El Asesor te dirá cómo vas.',
          example: 'Ej.: Gastar menos de US$ 300 al mes en restaurantes',
        },
        preference: {
          group: 'PREFERENCIAS',
          chip: 'Preferencia',
          hint: 'Cómo quieres que te responda o qué tener en cuenta siempre.',
          example: 'Ej.: Respuestas cortas, con el número primero',
        },
        event: {
          group: 'EVENTOS',
          chip: 'Evento',
          hint: 'Algo que viene y afecta tus gastos, para que lo considere al aconsejarte.',
          example: 'Ej.: Viaje familiar en diciembre',
        },
      }
    : {
        goal: {
          group: 'GOALS',
          chip: 'Goal',
          hint: 'Something you want to achieve with your money. The advisor will tell you how you are doing.',
          example: 'E.g. Spend under US$ 300 a month on restaurants',
        },
        preference: {
          group: 'PREFERENCES',
          chip: 'Preference',
          hint: 'How you want it to answer, or something to always keep in mind.',
          example: 'E.g. Short answers, number first',
        },
        event: {
          group: 'EVENTS',
          chip: 'Event',
          hint: 'Something coming up that affects your spending, so it factors it in.',
          example: 'E.g. Family trip in December',
        },
      };

  const load = useCallback(async () => {
    try {
      setItems(await listMemory());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const oops = () => Alert.alert(es ? 'No se pudo completar' : "Couldn't complete that", es ? 'Intenta de nuevo.' : 'Please try again.');

  const remove = (id: string) => {
    setItems((xs) => xs?.filter((x) => x.id !== id) ?? xs);
    deleteMemory(id).catch(() => {
      oops();
      load();
    });
  };

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addMemory(kind, draft);
      setDraft('');
      setAdding(false);
      await load();
    } catch {
      oops();
    } finally {
      setSaving(false);
    }
  };

  const confirm = (title: string, message: string, action: string, run: () => Promise<void>) =>
    Alert.alert(title, message, [
      { text: es ? 'Cancelar' : 'Cancel', style: 'cancel' },
      {
        text: action,
        style: 'destructive',
        onPress: () => {
          run().catch(oops);
        },
      },
    ]);

  const wipeMemory = () =>
    confirm(
      es ? '¿Borrar todo lo recordado?' : 'Delete everything remembered?',
      es ? 'El Asesor olvidará tus metas, preferencias y eventos.' : 'The advisor will forget your goals, preferences and events.',
      es ? 'Borrar' : 'Delete',
      async () => {
        await deleteAllMemory();
        setItems([]);
      },
    );

  const wipeChats = () =>
    confirm(
      es ? '¿Borrar tus conversaciones?' : 'Delete your conversations?',
      es ? 'Se borran todos los mensajes con el Asesor. No se puede deshacer.' : 'All messages with the advisor are deleted. This cannot be undone.',
      es ? 'Borrar' : 'Delete',
      deleteAllConversations,
    );

  const withdraw = () =>
    confirm(
      es ? '¿Retirar el permiso del Asesor?' : 'Withdraw advisor permission?',
      es
        ? 'El Asesor dejará de usar tus datos. Para volver a usarlo tendrás que aceptar de nuevo.'
        : 'The advisor will stop using your data. To use it again you will need to accept again.',
      es ? 'Retirar' : 'Withdraw',
      async () => {
        await revokeConsent();
        navigation.navigate('Tabs');
      },
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {es ? 'Lo que Poquet sabe de ti' : 'What Poquet knows about you'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sub}>
          {es
            ? 'Solo guarda lo que tú le pediste recordar. Borra lo que quieras.'
            : 'It only keeps what you asked it to remember. Delete anything you like.'}
        </Text>

        {items === null && !failed && <ActivityIndicator color={colors.ink3} style={{ marginTop: 30 }} />}
        {failed && (
          <Pressable onPress={load} style={{ marginTop: 20 }}>
            <Text style={styles.sub}>{es ? 'No pudimos cargar la memoria. Toca para reintentar.' : "Couldn't load memory. Tap to retry."}</Text>
          </Pressable>
        )}

        {items && items.length === 0 && !adding && (
          <View style={[styles.card, { padding: 16, marginTop: 20 }]}>
            <Text style={styles.itemText}>{es ? 'Todavía no hay nada guardado.' : 'Nothing saved yet.'}</Text>
            <Text style={[styles.sub, { marginTop: 4 }]}>
              {es
                ? 'Dile al Asesor algo como "recuerda que quiero pagar BAC completo cada mes".'
                : 'Tell the advisor something like "remember I want to pay BAC in full every month".'}
            </Text>
          </View>
        )}

        {items &&
          KINDS.map((k) => {
            const group = items.filter((i) => i.kind === k);
            if (group.length === 0) return null;
            return (
              <View key={k} style={{ marginTop: 22 }}>
                <Text style={styles.groupLabel}>{labels[k].group}</Text>
                <View style={styles.card}>
                  {group.map((it, idx) => (
                    <View key={it.id} style={[styles.itemRow, idx < group.length - 1 && styles.rowBorder]}>
                      <Text style={[styles.itemText, { flex: 1 }]}>{it.content}</Text>
                      <Pressable onPress={() => remove(it.id)} hitSlop={8} accessibilityLabel={es ? 'Borrar' : 'Delete'}>
                        <Ionicons name="trash-outline" size={17} color={colors.ink3} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}

        {adding ? (
          <View style={[styles.card, { padding: 14, marginTop: 22 }]}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {KINDS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.kindChip, kind === k && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                >
                  <Text style={[styles.kindChipText, kind === k && { color: colors.onTint2 }]}>{labels[k].chip}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.sub, { marginBottom: 10 }]}>{labels[kind].hint}</Text>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={labels[kind].example}
              placeholderTextColor={colors.ink3}
              maxLength={280}
              multiline
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable style={[styles.smallBtn, { flex: 1 }]} onPress={() => { setAdding(false); setDraft(''); }}>
                <Text style={styles.smallBtnText}>{es ? 'Cancelar' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, styles.smallBtnPrimary, { flex: 1 }, (!draft.trim() || saving) && { opacity: 0.4 }]}
                onPress={save}
                disabled={!draft.trim() || saving}
              >
                <Text style={[styles.smallBtnText, { color: colors.onTint2 }]}>{es ? 'Guardar' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          items && (
            <Pressable style={styles.addRow} onPress={() => setAdding(true)}>
              <Ionicons name="add" size={18} color={colors.ink} />
              <Text style={styles.addText}>{es ? 'Agregar algo que Poquet deba saber' : 'Add something Poquet should know'}</Text>
            </Pressable>
          )
        )}

        <View style={{ marginTop: 28, gap: 4 }}>
          {!!items?.length && (
            <Pressable style={styles.dangerRow} onPress={wipeMemory}>
              <Text style={styles.dangerText}>{es ? 'Borrar todo lo recordado' : 'Delete everything remembered'}</Text>
            </Pressable>
          )}
          <Pressable style={styles.dangerRow} onPress={wipeChats}>
            <Text style={styles.dangerText}>{es ? 'Borrar mis conversaciones' : 'Delete my conversations'}</Text>
          </Pressable>
          <Pressable style={styles.dangerRow} onPress={withdraw}>
            <Text style={styles.dangerText}>{es ? 'Retirar permiso del Asesor' : 'Withdraw advisor permission'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    title: { flex: 1, fontFamily: fonts.display, fontSize: 21, color: colors.ink },
    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    sub: { fontSize: 13, lineHeight: 19, color: colors.ink3 },
    groupLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: colors.ink3, marginBottom: 8 },
    card: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12, paddingHorizontal: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
    itemText: { fontSize: 14, lineHeight: 20, color: colors.ink },
    addRow: {
      marginTop: 22,
      minHeight: 50,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    addText: { fontSize: 14, fontWeight: '600', color: colors.ink },
    kindChip: { minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
    kindChipText: { fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
    input: {
      minHeight: 70,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      color: colors.ink,
      fontSize: 14,
      padding: 12,
      textAlignVertical: 'top',
    },
    smallBtn: { minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
    smallBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
    smallBtnText: { fontSize: 14, fontWeight: '700', color: colors.ink },
    dangerRow: { minHeight: 46, justifyContent: 'center' },
    dangerText: { fontSize: 14.5, fontWeight: '600', color: colors.ink2 },
  });
}
