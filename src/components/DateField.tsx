import React, { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColors } from '../theme/ThemeContext';
import { useAppTheme } from '../theme/ThemeContext';
import { radius } from '../theme';

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const colors = useColors();
  const { isDark } = useAppTheme();
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const styles = stylesFor(colors);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <DateTimePicker
          value={value}
          mode="date"
          display="compact"
          themeVariant={isDark ? 'dark' : 'light'}
          accentColor={colors.accent}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, d) => d && onChange(d)}
          style={styles.iosPicker}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setShowAndroidPicker(true)} style={styles.androidBtn}>
        <Text style={styles.androidBtnText}>{formatDate(value)}</Text>
      </Pressable>
      {showAndroidPicker && (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_, d) => {
            setShowAndroidPicker(false);
            if (d) onChange(d);
          }}
        />
      )}
    </View>
  );
}

function stylesFor(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    field: { flex: 1, minWidth: 0 },
    label: { fontSize: 10.5, fontWeight: '500', color: colors.ink3, marginBottom: 6, letterSpacing: 0.4 },
    iosPicker: { alignSelf: 'flex-start' },
    androidBtn: {
      padding: 11,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
    },
    androidBtnText: { color: colors.ink, fontSize: 12.5 },
  });
}
