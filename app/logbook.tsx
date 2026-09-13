import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Directory } from 'expo-file-system';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getLatestLogbookChanges, getLogbookFlights } from '@/data/logbook';
import { getLogbookImageThumbnails } from '@/data/logbookAttachments';
import { logbookToCsv } from '@/data/logbookImport';
import { formatMinutes, type LogbookFlight } from '@/domain/logbook';
import { useAppTheme } from '@/theme/theme';

type LogbookTab = 'overview' | 'flights';

const total = (flights: LogbookFlight[], field: 'flightTimeMinutes' | 'airtimeMinutes' | 'landingsTotal') =>
  flights.reduce((sum, flight) => sum + flight[field], 0);

const compactDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const editedAt = (value: number) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

const oxfordList = (items: string[]) => items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

export default function LogbookScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const [tab, setTab] = useState<LogbookTab>('overview');
  const [exporting, setExporting] = useState(false);
  const flights = useQuery({ queryKey: ['logbook-flights'], queryFn: () => getLogbookFlights(db) });
  const thumbnails = useQuery({ queryKey: ['logbook-thumbnails'], queryFn: () => getLogbookImageThumbnails(db) });
  const changes = useQuery({ queryKey: ['logbook-changes'], queryFn: () => getLatestLogbookChanges(db) });

  useFocusEffect(useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['logbook-flights'] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-thumbnails'] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-changes'] })
    ]);
  }, [queryClient]));

  const entries = flights.data ?? [];
  const completedEntries = entries.filter((flight) => flight.status === 'COMPLETE');
  const now = new Date();
  const ninetyDaysAgo = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  const recent = completedEntries.filter((flight) => new Date(`${flight.date}T00:00:00Z`).getTime() >= ninetyDaysAgo);
  const thisYear = completedEntries.filter((flight) => flight.date.startsWith(String(now.getUTCFullYear())));
  const aircraftMinutes = new Map<string, number>();
  for (const flight of completedEntries) aircraftMinutes.set(flight.aircraftType || 'Unspecified', (aircraftMinutes.get(flight.aircraftType || 'Unspecified') ?? 0) + flight.flightTimeMinutes);
  const aircraftStats = [...aircraftMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxAircraftMinutes = Math.max(1, ...aircraftStats.map(([, minutes]) => minutes));

  const exportCsv = async () => {
    if (!completedEntries.length || exporting) return;
    try {
      setExporting(true);
      const directory = await Directory.pickDirectoryAsync();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = directory.createFile(`AeroBrief-logbook-${stamp}.csv`, 'text/csv');
      file.write(logbookToCsv(completedEntries));
      Alert.alert('Export complete', `${file.name} was saved to the selected folder.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The CSV file could not be saved.';
      if (!/cancel/i.test(message)) Alert.alert('Export failed', message);
    } finally { setExporting(false); }
  };

  return (
    <>
      <Stack.Screen options={{
        title: 'Logbook',
        headerRight: () => (
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Import logbook" hitSlop={9} onPress={() => router.push('/logbook-import')}><Ionicons name="cloud-upload-outline" size={23} color={colors.text} /></Pressable>
            <Pressable disabled={!completedEntries.length || exporting} accessibilityRole="button" accessibilityLabel="Export logbook" hitSlop={9} onPress={() => void exportCsv()} style={{ opacity: !completedEntries.length || exporting ? 0.35 : 1 }}><Ionicons name="download-outline" size={23} color={colors.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Add flight" hitSlop={9} onPress={() => router.push('/logbook-entry')}><Ionicons name="add-circle-outline" size={25} color={colors.text} /></Pressable>
          </View>
        )
      }} />
      <Screen>
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.text }]}>Your flying at a glance</Text>
        </View>

        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: colors.surfaceRaised }]}>
          {(['overview', 'flights'] as LogbookTab[]).map((item) => {
            const active = item === tab;
            return <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item)} style={[styles.tab, { backgroundColor: active ? colors.primary : 'transparent' }]}><Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.text }]}>{item === 'overview' ? 'Overview' : `Flights${entries.length ? ` (${entries.length})` : ''}`}</Text></Pressable>;
          })}
        </View>

        {flights.isLoading ? <StateNotice loading title="Loading logbook" /> : flights.isError ? (
          <StateNotice title="Logbook unavailable" body="The local logbook database could not be opened." actionLabel="Try again" onAction={() => void flights.refetch()} />
        ) : !entries.length ? (
          <StateNotice icon="book-outline" title="Your logbook is empty" body="Import an XLSX or CSV logbook, or add a flight manually. Data stays on this device." actionLabel="Import flights" onAction={() => router.push('/logbook-import')} />
        ) : tab === 'overview' ? (
          <>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View><Text style={[styles.heroLabel, { color: colors.textMuted }]}>TOTAL BLOCK TIME</Text><Text style={[styles.heroValue, { color: colors.text }]}>{formatMinutes(total(completedEntries, 'flightTimeMinutes'))}</Text></View>
              <View style={styles.heroSide}><Text style={[styles.heroSmallValue, { color: colors.primary }]}>{formatMinutes(total(completedEntries, 'airtimeMinutes'))}</Text><Text style={[styles.heroSmallLabel, { color: colors.textMuted }]}>Air time</Text><Text style={[styles.heroSmallValue, { color: colors.primary }]}>{total(completedEntries, 'landingsTotal')}</Text><Text style={[styles.heroSmallLabel, { color: colors.textMuted }]}>Landings</Text></View>
            </View>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="calendar-outline" size={18} color={colors.primary} /><Text style={[styles.statValue, { color: colors.text }]}>{formatMinutes(total(recent, 'flightTimeMinutes'))}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>Last 90 days</Text></View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="stats-chart-outline" size={18} color={colors.primary} /><Text style={[styles.statValue, { color: colors.text }]}>{formatMinutes(total(thisYear, 'flightTimeMinutes'))}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>This year</Text></View>
              <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="airplane-outline" size={18} color={colors.primary} /><Text style={[styles.statValue, { color: colors.text }]}>{completedEntries.length}</Text><Text style={[styles.statLabel, { color: colors.textMuted }]}>Flights</Text></View>
            </View>
            <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.chartHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Aircraft time</Text><Text style={[styles.count, { color: colors.textMuted }]}>Block time</Text></View>
              {aircraftStats.map(([aircraft, minutes]) => (
                <View key={aircraft} style={styles.chartRow}>
                  <View style={styles.chartMeta}><Text style={[styles.chartLabel, { color: colors.text }]}>{aircraft}</Text><Text style={[styles.chartValue, { color: colors.textMuted }]}>{formatMinutes(minutes)}</Text></View>
                  <View style={[styles.track, { backgroundColor: colors.surfaceRaised }]}><View style={[styles.bar, { backgroundColor: colors.primary, width: `${Math.max(8, Math.round(minutes / maxAircraftMinutes * 100))}%` as `${number}%` }]} /></View>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.entriesHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Flights</Text><Text style={[styles.count, { color: colors.textMuted }]}>{entries.length} entries</Text></View>
            {entries.map((flight) => {
              const latest = changes.data?.[flight.id];
              const labels = latest?.changes.map((change) => change.label) ?? [];
              return (
                <Pressable key={flight.id} onPress={() => router.push({ pathname: '/logbook-flight', params: { id: flight.id } })} style={({ pressed }) => [styles.flightCard, { backgroundColor: colors.surface, borderColor: flight.needsReview ? colors.warning : colors.border, opacity: pressed ? 0.75 : 1 }]}>
                  <View style={styles.flightTop}>
                    <View style={styles.flightMain}><View style={styles.flightDateRow}><Text style={[styles.date, { color: colors.textMuted }]}>{compactDate(flight.date)}</Text>{flight.status === 'DRAFT' ? <View style={[styles.draftPill, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.draftText, { color: colors.warning }]}>Draft</Text></View> : null}</View><Text style={[styles.route, { color: colors.text }]}>{flight.departureAirport || 'Departure'} → {flight.arrivalAirport || 'Arrival'}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{[flight.callsign, flight.aircraftType].filter(Boolean).join(' · ') || 'Incomplete entry'}</Text></View>
                    {thumbnails.data?.[flight.id] ? <Image source={{ uri: thumbnails.data[flight.id] }} style={styles.flightImage} /> : <Text style={[styles.duration, { color: colors.text }]}>{formatMinutes(flight.flightTimeMinutes)}</Text>}
                  </View>
                  <View style={styles.flightStats}><Text style={[styles.durationCompact, { color: colors.text }]}>{formatMinutes(flight.flightTimeMinutes)}</Text><Text style={[styles.role, { color: colors.primary }]}>{flight.pilotRole}</Text><Text style={[styles.metaInline, { color: colors.textMuted }]}>{flight.landingsTotal} landing{flight.landingsTotal === 1 ? '' : 's'}</Text></View>
                  <View style={[styles.history, { borderTopColor: colors.border }]}><Ionicons name="time-outline" size={13} color={colors.textMuted} /><Text numberOfLines={2} style={[styles.historyText, { color: colors.textMuted }]}>{latest ? `Edited ${editedAt(latest.changedAt)} · ${oxfordList(labels.slice(0, 3))}${labels.length > 3 ? `, and ${labels.length - 3} more` : ''}` : `Added ${editedAt(flight.createdAt)}`}</Text></View>
                </Pressable>
              );
            })}
          </>
        )}
        <Text style={[styles.notice, { color: colors.textMuted }]}>AeroBrief does not yet replace a certified logbook. Keep your original records, and verify imported entries.</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 17 },
  intro: { marginBottom: 2 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
  tabs: { flexDirection: 'row', borderRadius: 15, padding: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 13, fontWeight: '900' },
  heroCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroValue: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5, marginTop: 3 },
  heroSide: { alignItems: 'flex-end' },
  heroSmallValue: { fontSize: 17, fontWeight: '900' },
  heroSmallLabel: { fontSize: 10, fontWeight: '700', marginBottom: 7 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, minHeight: 102, borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, padding: 11, justifyContent: 'space-between' },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, lineHeight: 13, fontWeight: '700' },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 13 },
  chartHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartRow: { gap: 6 },
  chartMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  chartLabel: { fontSize: 12, fontWeight: '800' },
  chartValue: { fontSize: 11, fontWeight: '700' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 999 },
  entriesHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  count: { fontSize: 11, fontWeight: '700' },
  flightCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, gap: 10 },
  flightTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  flightDateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  draftPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  draftText: { fontSize: 9, fontWeight: '900' },
  flightMain: { flex: 1 },
  date: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  route: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  duration: { fontSize: 19, fontWeight: '900' },
  durationCompact: { fontSize: 14, fontWeight: '900' },
  meta: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  metaInline: { fontSize: 11 },
  role: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginLeft: 'auto' },
  flightImage: { width: 72, height: 58, borderRadius: 11 },
  flightStats: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  history: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  historyText: { flex: 1, fontSize: 9, lineHeight: 13 },
  notice: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 }
});
