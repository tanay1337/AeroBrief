import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { applyLogbookImport, getLogbookFlights } from '@/data/logbook';
import { LOGBOOK_EXPORT_HEADERS, parseLogbookFile, type ParsedLogbookFile } from '@/data/logbookImport';
import { readPickedFile } from '@/data/localFiles';
import { formatMinutes, reconcileLogbookFlights, type PilotRole } from '@/domain/logbook';
import { useAppTheme } from '@/theme/theme';

const roleOptions: PilotRole[] = ['DUAL', 'PIC', 'SOLO', 'UNASSIGNED'];
const landingOptions = [
  { value: 'DAY' as const, label: 'Day' },
  { value: 'NIGHT' as const, label: 'Night' },
  { value: 'REVIEW' as const, label: 'Review later' }
];

export default function LogbookImportScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const existingFlights = useQuery({ queryKey: ['logbook-flights'], queryFn: () => getLogbookFlights(db) });
  const [role, setRole] = useState<PilotRole>('DUAL');
  const [landingKind, setLandingKind] = useState<'DAY' | 'NIGHT' | 'REVIEW'>('DAY');
  const [selected, setSelected] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [parsed, setParsed] = useState<ParsedLogbookFile | null>(null);
  const [decisions, setDecisions] = useState<Record<string, 'KEEP' | 'IMPORT'>>({});
  const [busy, setBusy] = useState(false);

  const reconciliation = useMemo(
    () => reconcileLogbookFlights(existingFlights.data ?? [], parsed?.flights ?? []),
    [existingFlights.data, parsed?.flights]
  );
  const newFlights = reconciliation.filter((item) => item.status === 'NEW');
  const unchangedFlights = reconciliation.filter((item) => item.status === 'UNCHANGED');
  const changedFlights = reconciliation.filter((item) => item.status === 'CHANGED');
  const acceptedUpdates = changedFlights.filter((item) => decisions[item.existing!.id] === 'IMPORT');

  const reparse = (nextRole = role, nextLanding = landingKind) => {
    if (!selected) return;
    setParsed(parseLogbookFile(selected.data, selected.name, nextRole, nextLanding));
    setDecisions({});
  };

  const chooseFile = async () => {
    try {
      setBusy(true);
      const picked = await File.pickFileAsync({ mimeTypes: [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ] });
      if (picked.canceled) return;
      const { name, bytes } = await readPickedFile(picked.result);
      const next = { name, data: bytes };
      setSelected(next);
      setParsed(parseLogbookFile(bytes, name, role, landingKind));
      setDecisions({});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected file could not be read.';
      if (!/cancel/i.test(message)) Alert.alert('Import failed', message);
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!parsed?.flights.length || busy) return;
    try {
      setBusy(true);
      const result = await applyLogbookImport(
        db,
        newFlights.map((item) => item.imported),
        acceptedUpdates.map((item) => ({ existing: item.existing!, imported: item.imported })),
        unchangedFlights.length
      );
      await queryClient.invalidateQueries({ queryKey: ['logbook-flights'] });
      await queryClient.invalidateQueries({ queryKey: ['logbook-changes'] });
      const kept = changedFlights.length - acceptedUpdates.length;
      Alert.alert(
        'Import complete',
        `${result.inserted} added, ${result.updated ?? 0} updated, ${unchangedFlights.length} unchanged, and ${kept} existing ${kept === 1 ? 'entry' : 'entries'} kept.`,
        [{ text: 'View logbook', onPress: () => router.replace('/logbook') }]
      );
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'The flights could not be saved.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Import logbook' }} />
      <Screen>
        <View style={[styles.info, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="shield-checkmark-outline" size={23} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.text }]}>New flights are added. Existing flights are never changed unless you review a difference and choose Use import.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>1. Choose defaults</Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>Pilot function</Text>
          <View style={styles.options}>{roleOptions.map((option) => (
            <Pressable key={option} onPress={() => { setRole(option); reparse(option, landingKind); }} style={[styles.chip, { backgroundColor: option === role ? colors.primary : colors.surfaceRaised }]}>
              <Text style={[styles.chipText, { color: option === role ? '#FFFFFF' : colors.text }]}>{option}</Text>
            </Pressable>
          ))}</View>
          <Text style={[styles.help, { color: colors.textMuted }]}>Crew text is preserved exactly and is never silently split into pilot and instructor names.</Text>
          <Text style={[styles.label, { color: colors.textMuted }]}>Imported landings</Text>
          <View style={styles.options}>{landingOptions.map((option) => (
            <Pressable key={option.value} onPress={() => { setLandingKind(option.value); reparse(role, option.value); }} style={[styles.chip, { backgroundColor: option.value === landingKind ? colors.primary : colors.surfaceRaised }]}>
              <Text style={[styles.chipText, { color: option.value === landingKind ? '#FFFFFF' : colors.text }]}>{option.label}</Text>
            </Pressable>
          ))}</View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>2. Select file</Text>
          <Text style={[styles.help, { color: colors.textMuted }]}>Accepted formats: XLSX and CSV.</Text>
          <Pressable disabled={busy} onPress={() => void chooseFile()} style={({ pressed }) => [styles.fileButton, { backgroundColor: colors.primary, opacity: busy || pressed ? 0.72 : 1 }]}>
            <Ionicons name="folder-open-outline" size={20} color="#FFFFFF" />
            <Text style={styles.fileButtonText}>{busy ? 'Reading…' : selected ? 'Choose another file' : 'Choose logbook file'}</Text>
          </Pressable>
        </View>

        {parsed ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>3. Review</Text>
            <Text style={[styles.fileName, { color: colors.primary }]}>{parsed.fileName}</Text>
            {parsed.missingHeaders.length ? (
              <Text style={[styles.warning, { color: colors.warning }]}>Missing columns: {parsed.missingHeaders.join(', ')}</Text>
            ) : <Text style={[styles.valid, { color: colors.success }]}>All {LOGBOOK_EXPORT_HEADERS.length} fields recognized.</Text>}
            <View style={styles.summaryRow}>
              <View style={[styles.summary, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.success }]}>{newFlights.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>New</Text></View>
              <View style={[styles.summary, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.warning }]}>{changedFlights.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Changed</Text></View>
              <View style={[styles.summary, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryValue, { color: colors.text }]}>{unchangedFlights.length}</Text><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Unchanged</Text></View>
            </View>

            {changedFlights.length ? <Text style={[styles.reviewTitle, { color: colors.text }]}>Review differences</Text> : null}
            {changedFlights.map((item) => {
              const key = item.existing!.id;
              const choice = decisions[key] ?? 'KEEP';
              return (
                <View key={key} style={[styles.changeCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.warning }]}>
                  <View style={styles.changeHeading}>
                    <View style={styles.previewMain}><Text style={[styles.previewRoute, { color: colors.text }]}>{item.imported.departureAirport} → {item.imported.arrivalAirport}</Text><Text style={[styles.previewMeta, { color: colors.textMuted }]}>{item.imported.date} · {item.imported.callsign}</Text></View>
                    <Text style={[styles.previewTime, { color: colors.text }]}>{formatMinutes(item.imported.flightTimeMinutes)}</Text>
                  </View>
                  {item.changes.map((change) => (
                    <View key={String(change.field)} style={styles.diffRow}>
                      <Text style={[styles.diffLabel, { color: colors.textMuted }]}>{change.label}</Text>
                      <Text style={[styles.diffText, { color: colors.text }]}>{change.before || 'Empty'} → {change.after || 'Empty'}</Text>
                    </View>
                  ))}
                  <View style={styles.decisionRow}>
                    {(['KEEP', 'IMPORT'] as const).map((decision) => (
                      <Pressable key={decision} onPress={() => setDecisions((current) => ({ ...current, [key]: decision }))} style={[styles.decision, { backgroundColor: choice === decision ? colors.primary : colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.decisionText, { color: choice === decision ? '#FFFFFF' : colors.text }]}>{decision === 'KEEP' ? 'Keep existing' : 'Use import'}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}

            {newFlights.slice(0, 6).map((item, index) => (
              <View key={`${item.imported.sourceFingerprint}-${index}`} style={[styles.previewRow, { borderTopColor: colors.border }]}>
                <View style={styles.previewMain}><Text style={[styles.previewRoute, { color: colors.text }]}>{item.imported.departureAirport} → {item.imported.arrivalAirport}</Text><Text style={[styles.previewMeta, { color: colors.textMuted }]}>{item.imported.date} · {item.imported.callsign} · New</Text></View>
                <Text style={[styles.previewTime, { color: colors.text }]}>{formatMinutes(item.imported.flightTimeMinutes)}</Text>
              </View>
            ))}
            {newFlights.length > 6 ? <Text style={[styles.help, { color: colors.textMuted }]}>And {newFlights.length - 6} more new flights…</Text> : null}

            <Pressable disabled={busy || parsed.flights.length === 0} onPress={() => void commit()} style={({ pressed }) => [styles.fileButton, { backgroundColor: colors.primary, opacity: busy || pressed || parsed.flights.length === 0 ? 0.62 : 1 }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.fileButtonText}>{busy ? 'Importing…' : 'Apply import'}</Text>
            </Pressable>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  info: { borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 21, padding: 16, gap: 11 },
  cardTitle: { fontSize: 21, fontWeight: '900' },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 13, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '900' },
  help: { fontSize: 12, lineHeight: 18 },
  fileButton: { minHeight: 49, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  fileButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  fileName: { fontSize: 14, fontWeight: '900' },
  valid: { fontSize: 12, fontWeight: '800' },
  warning: { fontSize: 12, lineHeight: 18, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summary: { flex: 1, borderRadius: 13, padding: 10, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { fontSize: 10, fontWeight: '800' },
  reviewTitle: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  changeCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 8 },
  changeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  diffRow: { gap: 2 },
  diffLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  diffText: { fontSize: 11, lineHeight: 16 },
  decisionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  decision: { flex: 1, minHeight: 38, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  decisionText: { fontSize: 11, fontWeight: '900' },
  previewRow: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewMain: { flex: 1 },
  previewRoute: { fontSize: 14, fontWeight: '900' },
  previewMeta: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  previewTime: { fontSize: 15, fontWeight: '900' }
});
