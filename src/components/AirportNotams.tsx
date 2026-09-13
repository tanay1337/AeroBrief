import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { InformationalNotamResult } from '@/data/notams';
import { DFS_BRIEFING_URL, openInAppBrowser } from '@/navigation/inAppBrowser';
import { useAppTheme } from '@/theme/theme';

const FAA_SEARCH_URL = 'https://notams.aim.faa.gov/notamSearch/nsapp.html';
const GERMAN_NOTAM_INFORMATION = 'German NOTAMs are provided through the official DFS PilotService briefing. A complete briefing depends on route, time, and altitude, not only the airport identifier.';

export function AirportNotams({
  icao,
  countryCode,
  result,
  loading,
  error
}: {
  icao: string;
  countryCode: string;
  result: InformationalNotamResult | undefined;
  loading: boolean;
  error: boolean;
}): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const notices = result?.notices ?? [];

  if (countryCode === 'DE') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <View style={styles.headingRow}>
          <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View>
          <View style={styles.headingText}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>OFFICIAL NOTAM BRIEFING</Text>
            <Text style={[styles.title, { color: colors.text }]}>NOTAMs for {icao}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="About official NOTAM briefings" hitSlop={8} onPress={() => Alert.alert('About NOTAM briefings', GERMAN_NOTAM_INFORMATION)}>
            <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="link" onPress={() => openInAppBrowser(DFS_BRIEFING_URL, 'DFS PilotService')} style={[styles.primaryAction, { backgroundColor: colors.primary }]}> 
          <Ionicons name="open-outline" size={17} color="#FFFFFF" />
          <Text style={styles.primaryActionText}>Open DFS PilotService for {icao}</Text>
        </Pressable>
      </View>
    );
  }

  // The FAA search and airport-only feed are appropriate for US airports only.
  // Other jurisdictions stay hidden until AeroBrief has a mapped official source.
  if (countryCode !== 'US') return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-text-outline" size={20} color={colors.primary} /></View>
        <View style={styles.headingText}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>FAA NOTAM INFORMATION</Text>
          <Text style={[styles.title, { color: colors.text }]}>Airport notices for {icao}</Text>
        </View>
      </View>
      <View style={[styles.caution, { backgroundColor: colors.primarySoft }]}> 
        <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
        <Text style={[styles.cautionText, { color: colors.text }]}>Airport-only information from the FAA. Use the official FAA search below for a complete briefing.</Text>
      </View>

      {loading ? <Text style={[styles.status, { color: colors.textMuted }]}>Retrieving airport notices…</Text> : null}
      {!loading && error ? <Text style={[styles.status, { color: colors.warning }]}>FAA airport notices are unavailable. Use the official search below.</Text> : null}
      {!loading && !error && notices.length === 0 ? <Text style={[styles.status, { color: colors.textMuted }]}>No active notices were returned for {icao}. This does not prove that no relevant NOTAM exists.</Text> : null}

      {notices.map((notice) => {
        const isExpanded = expanded === notice.id;
        return (
          <Pressable key={notice.id} onPress={() => setExpanded(isExpanded ? null : notice.id)} style={[styles.notice, { backgroundColor: colors.surfaceRaised }]}> 
            <View style={styles.noticeTitleRow}>
              <Text style={[styles.noticeNumber, { color: colors.text }]}>{notice.number}</Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.primary} />
            </View>
            <Text style={[styles.validity, { color: colors.textMuted }]}>{notice.starts || 'Start not supplied'} → {notice.ends || 'End not supplied'} UTC</Text>
            <Text numberOfLines={isExpanded ? undefined : 3} style={[styles.summary, { color: colors.text }]}>{isExpanded ? notice.raw : notice.summary}</Text>
          </Pressable>
        );
      })}

      {result && result.total > notices.length ? <Text style={[styles.partial, { color: colors.textMuted }]}>Showing {notices.length} of {result.total} results returned by the source.</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="link" onPress={() => openInAppBrowser(FAA_SEARCH_URL, 'FAA NOTAM Search')} style={[styles.secondaryAction, { borderColor: colors.border }]}> 
          <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Open FAA NOTAM Search</Text>
          <Ionicons name="open-outline" size={15} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 11 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  title: { fontSize: 18, fontWeight: '900', marginTop: 1 },
  caution: { borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cautionText: { flex: 1, fontSize: 11, lineHeight: 16 },
  status: { fontSize: 12, lineHeight: 18 },
  notice: { borderRadius: 13, padding: 12, gap: 4 },
  noticeTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  noticeNumber: { fontSize: 14, fontWeight: '900' },
  validity: { fontSize: 10, lineHeight: 14 },
  summary: { fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  partial: { fontSize: 10, lineHeight: 15 },
  actions: { gap: 8, marginTop: 2 },
  primaryAction: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  secondaryAction: { minHeight: 42, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  secondaryActionText: { fontSize: 12, fontWeight: '800' }
});
