import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlannedBriefingAttachments } from '@/components/PlannedNotamBriefing';
import { getDfsChartLinks } from '@/data/dfsCharts';
import { openInAppBrowser } from '@/navigation/inAppBrowser';
import { useAppTheme } from '@/theme/theme';

export function PlannedAerodromeBriefing({ flightId, ident, label, onOpen }: { flightId: string; ident: string; label: string; onOpen: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  const links = getDfsChartLinks(ident);
  const [managing, setManaging] = useState(false);
  return <View style={[styles.group, { borderTopColor: colors.border }]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${ident} aerodrome`} onPress={onOpen} style={styles.airport}>
        <Ionicons name="airplane-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>{ident}</Text><Text style={[styles.note, { color: colors.textMuted }]}>{label} · Details</Text></View>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${ident} charts`} accessibilityState={{ expanded: managing }} onPress={() => setManaging(!managing)} style={styles.manage}><Ionicons name={managing ? 'close-outline' : 'attach'} size={20} color={colors.primary} /></Pressable>
    </View>
    <View style={styles.content}>
      <PlannedBriefingAttachments compact controlsVisible={managing} flightId={flightId} airportIdent={ident} category="APPROACH_PLATE" label="Approach plates" icon="navigate-outline" />
      <PlannedBriefingAttachments compact controlsVisible={managing} flightId={flightId} airportIdent={ident} category="AERODROME_LAYOUT" label="Aerodrome layouts" icon="map-outline" />
    </View>
    {managing && (links.vfr ?? links.ifr) ? <Pressable accessibilityRole="button" onPress={() => openInAppBrowser((links.vfr ?? links.ifr)!, 'Official AIP')} style={styles.aip}><Ionicons name="open-outline" size={17} color={colors.primary} /><Text style={[styles.aipText, { color: colors.primary }]}>Official AIP · {ident}</Text></Pressable> : null}

  </View>;
}
const styles = StyleSheet.create({
  group: { borderTopWidth: 1, paddingTop: 6 }, row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6 },
  airport: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '800' }, note: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  content: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' }, manage: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  aip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, aipText: { fontSize: 12, fontWeight: '700' }
});
