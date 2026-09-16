import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.btn} hitSlop={8}>
      <Text style={styles.chevron}>{'‹'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hair4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: { color: colors.ink, fontSize: 17, marginTop: -2 },
});
