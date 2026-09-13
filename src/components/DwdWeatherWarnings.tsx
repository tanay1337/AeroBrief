import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DwdWarning } from '@/data/dwd';
import { openInAppBrowser } from '@/navigation/inAppBrowser';
import { useAppTheme } from '@/theme/theme';

const DWD_WARNINGS_URL = 'https://www.dwd.de/EN/weather/warnings/warnings_node.html';

const severityColor = (severity: DwdWarning['severity'], colors: ReturnType<typeof useAppTheme>['colors']): string => {
  if (severity === 'Extreme' || severity === 'Severe') return colors.danger;
  if (severity === 'Moderate') return colors.warning;
  return colors.primary;
};

const validity = (warning: DwdWarning): string | null => {
  if (!warning.onset && !warning.expires) return null;
  const format = (value: string | null) => value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : 'now';
  return `${format(warning.onset)} to ${format(warning.expires)}`;
};

export function DwdWeatherWarnings({
  warnings,
  loading,
  error
}: {
  warnings: DwdWarning[];
  loading: boolean;
  error: boolean;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="warning-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>DWD DECISION SUPPORT</Text>
          <Text style={[styles.title, { color: colors.text }]}>Official weather warnings</Text>
        </View>
      </View>

      {loading ? <Text style={[styles.status, { color: colors.textMuted }]}>Checking warnings at the airport…</Text> : null}
      {!loading && error ? <Text style={[styles.status, { color: colors.warning }]}>DWD warnings could not be loaded. Check the official map.</Text> : null}
      {!loading && !error && warnings.length === 0 ? (
        <View style={styles.clearRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={[styles.status, { color: colors.text }]}>No active DWD warning intersects the airport.</Text>
        </View>
      ) : null}
      {warnings.map((warning) => {
        const accent = severityColor(warning.severity, colors);
        return (
          <View key={warning.id} style={[styles.warning, { borderLeftColor: accent, backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.warningTop}>
              <Text style={[styles.warningTitle, { color: colors.text }]}>{warning.headline}</Text>
              <Text style={[styles.severity, { color: accent }]}>{warning.severity.toUpperCase()}</Text>
            </View>
            <Text style={[styles.region, { color: colors.textMuted }]}>{warning.regionName}{validity(warning) ? ` · ${validity(warning)}` : ''}</Text>
            {warning.description ? <Text numberOfLines={5} style={[styles.description, { color: colors.text }]}>{warning.description}</Text> : null}
          </View>
        );
      })}

      <Pressable accessibilityRole="link" onPress={() => openInAppBrowser(DWD_WARNINGS_URL, 'DWD weather warnings')} style={styles.link}>
        <Text style={[styles.linkText, { color: colors.primary }]}>Open DWD warnings in English</Text>
        <Ionicons name="open-outline" size={16} color={colors.primary} />
      </Pressable>
      <Text style={[styles.footnote, { color: colors.textMuted }]}>English summary of the official point warning · Open DWD for the full authoritative text. General warnings supplement, but do not replace, aviation weather and an authorized briefing.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: '900', marginTop: 1 },
  status: { fontSize: 13, lineHeight: 19, flex: 1 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warning: { borderLeftWidth: 4, borderRadius: 12, padding: 12, gap: 5 },
  warningTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  warningTitle: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  severity: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  region: { fontSize: 11, lineHeight: 16 },
  description: { fontSize: 12, lineHeight: 18 },
  link: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  linkText: { fontSize: 13, fontWeight: '800' },
  footnote: { fontSize: 10, lineHeight: 15 }
});
