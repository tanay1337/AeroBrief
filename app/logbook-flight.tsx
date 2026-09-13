import { RouteFuelCheckCard } from '@/components/RouteFuelCheckCard';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DocumentViewerModal, getDocumentImagePage, type DocumentViewerState } from '@/components/DocumentViewerModal';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getLogbookChanges, getLogbookFlight, logbookChangeHistoryQueryKey } from '@/data/logbook';
import { getLogbookAttachments } from '@/data/logbookAttachments';
import { generateFlightWeatherBriefing, getFlightWeatherBriefing } from '@/data/flightWeather';
import { createPdfViewer, deletePdfViewer } from '@/data/pdfViewer';
import { getFlightRouteSnapshot } from '@/data/routePlans';
import { getFlightWeightBalance } from '@/data/weightBalance';
import { formatMinutes, formatRecordedMinutes, PREFLIGHT_ATTACHMENT_CATEGORIES, type LogbookAttachment, type LogbookAttachmentCategory } from '@/domain/logbook';
import { useAppTheme } from '@/theme/theme';

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element | null {
  const { colors } = useAppTheme();
  if (!value) return null;
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text><Text selectable style={[styles.detailValue, { color: colors.text }]}>{value}</Text></View>;
}

const displayDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const historyTime = (value: number) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function LogbookFlightScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const [viewer, setViewer] = useState<DocumentViewerState | null>(null);
  const [expandedMaterial, setExpandedMaterial] = useState<LogbookAttachmentCategory | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const flight = useQuery({ queryKey: ['logbook-flight', id], queryFn: () => getLogbookFlight(db, id!), enabled: Boolean(id) });
  const attachments = useQuery({ queryKey: ['logbook-attachments', id], queryFn: () => getLogbookAttachments(db, id!), enabled: Boolean(id) });
  const changes = useQuery({ queryKey: logbookChangeHistoryQueryKey(id), queryFn: () => getLogbookChanges(db, id!), enabled: Boolean(id) });
  const weightBalance = useQuery({ queryKey: ['flight-weight-balance', id], queryFn: () => getFlightWeightBalance(db, id!), enabled: Boolean(id) });
  const weatherBriefing = useQuery({ queryKey: ['flight-weather-briefing', id], queryFn: () => getFlightWeatherBriefing(db, id!), enabled: Boolean(id) });
  const plannedRoute = useQuery({ queryKey: ['flight-route', id], queryFn: () => getFlightRouteSnapshot(db, id!), enabled: Boolean(id) });

  const openWeather = async () => {
    if (!id || !flight.data) return;
    if (weatherBriefing.data) { router.push({ pathname: '/flight-weather', params: { id } }); return; }
    try {
      setWeatherBusy(true);
      await generateFlightWeatherBriefing(db, id, flight.data.departureAirport, flight.data.arrivalAirport);
      await queryClient.invalidateQueries({ queryKey: ['flight-weather-briefing', id] });
      router.push({ pathname: '/flight-weather', params: { id } });
    } catch (error) {
      Alert.alert('Could not generate weather briefing', error instanceof Error ? error.message : 'Check the airport codes and connection, then retry.');
    } finally { setWeatherBusy(false); }
  };

  const allAttachments = attachments.data ?? [];
  const images = allAttachments.filter((attachment) => attachment.category === 'GENERAL' && attachment.mimeType.startsWith('image/'));
  const otherFiles = allAttachments.filter((attachment) => attachment.category === 'GENERAL' && !attachment.mimeType.startsWith('image/'));

  const openImages = async () => {
    setViewer({ name: 'Flight images', pages: [], directory: null, loading: true });
    setViewer({ name: 'Flight images', pages: await Promise.all(images.map((image) => getDocumentImagePage(image.uri))), directory: null, loading: false });
  };
  const openFile = async (attachment: LogbookAttachment) => {
    if (attachment.mimeType.startsWith('image/')) {
      setViewer({ name: attachment.name, pages: [await getDocumentImagePage(attachment.uri)], directory: null, loading: false });
      return;
    }
    setViewer({ name: attachment.name, pages: [], directory: null, loading: true });
    try {
      const preview = await createPdfViewer(attachment.uri);
      setViewer({ name: attachment.name, pages: [], webUri: preview.viewerUri, directory: preview.directory, loading: false });
    } catch (error) {
      setViewer({ name: attachment.name, pages: [], directory: null, loading: false, error: error instanceof Error ? error.message : 'This attachment could not be previewed.' });
    }
  };
  const closeViewer = () => { deletePdfViewer(viewer?.directory ?? null); setViewer(null); };

  if (flight.isLoading) return <Screen scroll={false}><StateNotice loading title="Loading flight" /></Screen>;
  if (flight.isError || !flight.data) return <Screen scroll={false}><StateNotice title="Flight unavailable" body="This logbook entry could not be found." /></Screen>;
  const entry = flight.data;

  return (
    <>
      <Stack.Screen options={{
        title: entry.departureAirport && entry.arrivalAirport ? `${entry.departureAirport} to ${entry.arrivalAirport}` : 'Draft flight',
        headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Edit flight" hitSlop={10} onPress={() => router.push({ pathname: '/logbook-entry', params: { id: entry.id } })}><Ionicons name="create-outline" size={24} color={colors.text} /></Pressable>
      }} />
      <Screen>
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeading}><Text style={[styles.date, { color: colors.textMuted }]}>{displayDate(entry.date)}</Text>{entry.status === 'DRAFT' ? <View style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.pillText, { color: colors.warning }]}>Draft</Text></View> : null}</View>
          <View style={styles.routeRow}><Text style={[styles.route, { color: colors.text }]}>{entry.departureAirport || 'Departure'} → {entry.arrivalAirport || 'Arrival'}</Text><Text style={[styles.duration, { color: colors.primary }]}>{formatMinutes(entry.flightTimeMinutes)}</Text></View>
          <Text style={[styles.aircraft, { color: colors.textMuted }]}>{[entry.callsign, entry.aircraftType].filter(Boolean).join(' · ')}</Text>
          <View style={styles.pills}><View style={[styles.pill, { backgroundColor: colors.primarySoft }]}><Text style={[styles.pillText, { color: colors.primary }]}>{entry.pilotRole}</Text></View><View style={[styles.pill, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.pillText, { color: colors.text }]}>{entry.landingsTotal} landing{entry.landingsTotal === 1 ? '' : 's'}</Text></View></View>
        </View>

        {images.length ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cardHeading}><Text style={[styles.cardTitle, { color: colors.text }]}>Images</Text><Text style={[styles.count, { color: colors.textMuted }]}>{images.length}</Text></View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
              {images.map((image) => <Pressable key={image.id} accessibilityRole="button" accessibilityLabel={`Open ${image.name}`} onPress={() => void openImages()}><Image source={{ uri: image.uri }} resizeMode="cover" style={styles.galleryImage} /></Pressable>)}
            </ScrollView>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Times</Text>
          <View style={styles.timeGroup}>
            <View style={styles.timePair}><Detail label="Block off" value={entry.blockOffTime ? `${entry.blockOffTime} UTC` : ''} /><Detail label="Block on" value={entry.blockOnTime ? `${entry.blockOnTime} UTC` : ''} /></View>
            <Detail label="Block time" value={formatMinutes(entry.flightTimeMinutes)} />
          </View>
          <View style={[styles.timeGroup, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.timePair}><Detail label="Takeoff" value={entry.departureTime ? `${entry.departureTime} UTC` : ''} /><Detail label="Landing" value={entry.landingTime ? `${entry.landingTime} UTC` : ''} /></View>
            <Detail label="Air time" value={formatMinutes(entry.airtimeMinutes)} />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Crew and experience</Text>
          <View style={styles.detailsGrid}><Detail label="Crew / instructor" value={entry.crew} /><Detail label="PIC name" value={entry.picName} /><Detail label="PIC time" value={formatRecordedMinutes(entry.picMinutes)} /><Detail label="Dual time" value={formatRecordedMinutes(entry.dualMinutes)} /><Detail label="Instructor time" value={formatRecordedMinutes(entry.instructorMinutes)} /><Detail label="Night time" value={formatRecordedMinutes(entry.nightMinutes)} /><Detail label="IFR time" value={formatRecordedMinutes(entry.ifrMinutes)} /><Detail label="Day / night landings" value={entry.landingsTotal > 0 ? `${entry.landingsDay ?? 0} / ${entry.landingsNight ?? 0}` : ''} /></View>
        </View>

        {entry.remarks ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Remarks</Text><Text selectable style={[styles.remarks, { color: colors.text }]}>{entry.remarks}</Text></View> : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Text style={[styles.cardTitle, { color: colors.text }]}>Pre-flight materials</Text>
          <Pressable disabled={weatherBusy || !entry.departureAirport || !entry.arrivalAirport} onPress={() => void openWeather()} style={[styles.checklistRow, { borderTopColor: colors.border }]}>
            <Ionicons name={weatherBriefing.data ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={weatherBriefing.data ? colors.success : colors.textMuted} />
            <View style={styles.fileCopy}><Text style={[styles.fileName, { color: colors.text }]}>Weather briefing</Text><Text style={[styles.fileMeta, { color: colors.textMuted }]}>{weatherBriefing.data ? `Generated ${historyTime(weatherBriefing.data.generatedAt)}` : weatherBusy ? 'Generating…' : 'Tap to generate'}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable disabled={!weightBalance.data} onPress={() => router.push({ pathname: '/weight-balance-entry', params: { calculationId: weightBalance.data!.id } })} style={[styles.checklistRow, { borderTopColor: colors.border }]}> 
            <Ionicons name={weightBalance.data ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={weightBalance.data ? (weightBalance.data.result.valid ? colors.success : colors.danger) : colors.textMuted} />
            <View style={styles.fileCopy}><Text style={[styles.fileName, { color: colors.text }]}>Mass and Balance</Text><Text style={[styles.fileMeta, { color: colors.textMuted }]}>{weightBalance.data ? `${weightBalance.data.title} · ${weightBalance.data.result.valid ? 'Within limits' : 'Check limits'}` : 'Not attached'}</Text></View>
            {weightBalance.data ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
          </Pressable>
          <Pressable disabled={!plannedRoute.data} onPress={() => router.push({ pathname: '/route-plan-view', params: { flightId: entry.id } })} style={[styles.checklistRow, { borderTopColor: colors.border }]}> 
            <Ionicons name={plannedRoute.data ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={plannedRoute.data ? colors.success : colors.textMuted} />
            <View style={styles.fileCopy}><Text style={[styles.fileName, { color: colors.text }]}>Planned route</Text><Text numberOfLines={1} style={[styles.fileMeta, { color: colors.textMuted }]}>{plannedRoute.data ? `${plannedRoute.data.plan.title} · ${plannedRoute.data.plan.waypoints.map((point) => point.ident).join(' → ')}` : 'Not attached'}</Text></View>
            {plannedRoute.data ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
          </Pressable>
          {plannedRoute.data && weightBalance.data ? <RouteFuelCheckCard route={plannedRoute.data.plan} calculation={weightBalance.data} flight={entry} /> : null}
          {PREFLIGHT_ATTACHMENT_CATEGORIES.map(({ category, label }) => {
            const files = allAttachments.filter((attachment) => attachment.category === category);
            const expanded = expandedMaterial === category;
            const openMaterial = () => {
              if (files.length === 1) void openFile(files[0]!);
              else if (files.length > 1) setExpandedMaterial(expanded ? null : category);
            };
            return <View key={category} style={[styles.checklistGroup, { borderTopColor: colors.border }]}><Pressable disabled={!files.length} onPress={openMaterial} style={styles.checklistRowPlain}><Ionicons name={files.length ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={files.length ? colors.success : colors.textMuted} /><View style={styles.fileCopy}><Text style={[styles.fileName, { color: colors.text }]}>{label}</Text><Text style={[styles.fileMeta, { color: colors.textMuted }]}>{files.length ? `${files.length} attached` : 'Not attached'}</Text></View>{files.length ? <Ionicons name={files.length > 1 && expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.textMuted} /> : null}</Pressable>{expanded ? files.map((attachment) => <Pressable key={attachment.id} onPress={() => void openFile(attachment)} style={styles.briefingFile}>{attachment.mimeType.startsWith('image/') ? <Image source={{ uri: attachment.uri }} style={styles.briefingThumbnail} /> : <Ionicons name="document-outline" size={17} color={colors.primary} />}<Text numberOfLines={1} style={[styles.briefingFileName, { color: colors.text }]}>{attachment.name}</Text><Ionicons name="chevron-forward" size={15} color={colors.textMuted} /></Pressable>) : null}</View>;
          })}
        </View>

        {otherFiles.length ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Other attachments</Text>{otherFiles.map((attachment) => <Pressable key={attachment.id} onPress={() => void openFile(attachment)} style={[styles.fileRow, { borderTopColor: colors.border }]}><Ionicons name="document-outline" size={21} color={colors.primary} /><View style={styles.fileCopy}><Text numberOfLines={1} style={[styles.fileName, { color: colors.text }]}>{attachment.name}</Text><Text style={[styles.fileMeta, { color: colors.textMuted }]}>{Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>)}</View> : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Record history</Text>
          {(changes.data ?? []).map((change) => <View key={change.id} style={[styles.historyRow, { borderTopColor: colors.border }]}><Ionicons name="time-outline" size={16} color={colors.textMuted} /><View style={styles.historyCopy}><Text style={[styles.historyTitle, { color: colors.text }]}>{change.source === 'IMPORT' ? 'Updated from import' : 'Edited'} · {historyTime(change.changedAt)}</Text><Text style={[styles.historyText, { color: colors.textMuted }]}>{change.changes.map((item) => item.label).join(', ')}</Text></View></View>)}
          <View style={[styles.historyRow, { borderTopColor: colors.border }]}><Ionicons name="add-circle-outline" size={16} color={colors.textMuted} /><View style={styles.historyCopy}><Text style={[styles.historyTitle, { color: colors.text }]}>Added · {historyTime(entry.createdAt)}</Text></View></View>
        </View>
        <DocumentViewerModal viewer={viewer} onClose={closeViewer} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 18, gap: 7 },
  date: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  routeRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  route: { flex: 1, fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  duration: { fontSize: 24, fontWeight: '900' },
  aircraft: { fontSize: 13, fontWeight: '700' },
  pills: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  pillText: { fontSize: 10, fontWeight: '900' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 12 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { fontSize: 20, fontWeight: '900' },
  count: { fontSize: 11, fontWeight: '800' },
  gallery: { gap: 9 },
  galleryImage: { width: 148, height: 112, borderRadius: 13 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeGroup: { gap: 6, paddingTop: 10 }, timePair: { flexDirection: 'row', gap: 10 },
  detail: { width: '48%', minHeight: 54 },
  detailLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  detailValue: { fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 3 },
  remarks: { fontSize: 13, lineHeight: 20 },
  fileRow: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '800' },
  fileMeta: { fontSize: 10, marginTop: 2 },
  checklistRow: { minHeight: 54, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checklistGroup: { borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  checklistRowPlain: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
  briefingFile: { minHeight: 32, marginLeft: 31, flexDirection: 'row', alignItems: 'center', gap: 8 },
  briefingThumbnail: { width: 30, height: 30, borderRadius: 6 },
  briefingFileName: { flex: 1, fontSize: 11, fontWeight: '700' },
  historyRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  historyText: { fontSize: 10, lineHeight: 15, marginTop: 2 }
});
