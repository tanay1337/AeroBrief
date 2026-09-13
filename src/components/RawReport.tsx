import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme';

export function RawReport({ label, report }: { label: string; report: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.header}
      >
        <View>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>RAW REPORT</Text>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {expanded ? (
        <Text selectable style={[styles.raw, { color: colors.text, backgroundColor: colors.surfaceRaised }]}>{report}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, letterSpacing: 1, fontWeight: '800' },
  label: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  raw: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20, padding: 14, borderRadius: 12 }
});
