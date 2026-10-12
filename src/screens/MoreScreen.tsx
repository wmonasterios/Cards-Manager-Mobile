import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub?: string;
  onPress: () => void;
};

// "More" tab: home for everything that left the bottom bar — statements
// (upload, history, forwarding address) and settings.
export function MoreScreen({ navigation }: any) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { lang, t } = useLocale();
  const es = lang === 'es';

  const groups: { label: string; rows: Row[] }[] = [
    {
      label: es ? 'ESTADOS DE CUENTA' : 'STATEMENTS',
      rows: [
        {
          icon: 'cloud-upload-outline',
          title: es ? 'Agregar un estado de cuenta' : 'Add a statement',
          sub: es ? 'Sube el PDF o reenvía el correo del banco' : "Upload the PDF or forward the bank's email",
          onPress: () => navigation.navigate('Statements', { cardId: undefined }),
        },
        {
          icon: 'document-text-outline',
          title: es ? 'Historial y correo de reenvío' : 'History and forwarding address',
          sub: es ? 'Todos tus estados de cuenta y tu dirección privada' : 'All your statements and your private address',
          onPress: () => navigation.navigate('Statements', { cardId: undefined }),
        },
      ],
    },
    {
      label: es ? 'AJUSTES' : 'SETTINGS',
      rows: [
        {
          icon: 'settings-outline',
          title: t.settings,
          sub: es
            ? 'Notificaciones, seguridad (PIN y Face ID), apariencia, idioma y cuenta'
            : 'Notifications, security (PIN and Face ID), appearance, language and account',
          onPress: () => navigation.navigate('Settings'),
        },
      ],
    },
    {
      label: es ? 'AYUDA' : 'HELP',
      rows: [
        {
          icon: 'chatbubble-ellipses-outline',
          title: es ? 'Escríbenos' : 'Contact us',
          sub: 'support@poquetapp.com',
          onPress: () => Linking.openURL('mailto:support@poquetapp.com').catch(() => {}),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.title}>{es ? 'Más' : 'More'}</Text>
        </View>
        {groups.map((g) => (
          <View key={g.label} style={styles.section}>
            <Text style={styles.groupLabel}>{g.label}</Text>
            <View style={styles.card}>
              {g.rows.map((r, i) => (
                <Pressable
                  key={r.title}
                  onPress={r.onPress}
                  style={[styles.row, i < g.rows.length - 1 && styles.rowBorder]}
                  accessibilityRole="button"
                >
                  <View style={styles.iconBox}>
                    <Ionicons name={r.icon} size={17} color={colors.ink2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    {!!r.sub && (
                      <Text style={styles.rowSub} numberOfLines={2}>
                        {r.sub}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 32 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    title: { fontSize: 26, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.3 },
    section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
    groupLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, color: colors.ink3, marginBottom: 8 },
    card: {
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: { fontSize: 14.5, fontWeight: '600', color: colors.ink },
    rowSub: { fontSize: 12, color: colors.ink3, marginTop: 2, lineHeight: 16 },
  });
}
