import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme';

interface MetricCardProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  detail?: string;
  help?: string;
}

export function MetricCard({ icon, label, value, detail, help }: MetricCardProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${detail ? `. ${detail}` : ''}`}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} color={colors.primary} size={20} />
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        {help ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${showHelp ? 'Hide' : 'Show'} ${label.toLowerCase()} details`}
            hitSlop={8}
            onPress={() => setShowHelp((current) => !current)}
          >
            <Ionicons name={showHelp ? 'close-circle-outline' : 'information-circle-outline'} size={17} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      <Text numberOfLines={2} style={[styles.value, { color: colors.text }]}>{value}</Text>
      {detail ? <Text style={[styles.detail, { color: colors.textMuted }]}>{detail}</Text> : null}
      {help && showHelp ? <Text style={[styles.help, { color: colors.textMuted }]}>{help}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '48.5%', minHeight: 142, borderRadius: 18, padding: 14, borderWidth: 1 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 20, fontWeight: '800', marginTop: 3 },
  detail: { fontSize: 12, marginTop: 4 },
  help: { fontSize: 11, lineHeight: 15, marginTop: 5 }
});
