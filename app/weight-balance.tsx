import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getAircraftProfiles, getReadyAircraftProfiles } from '@/data/aircraftProfiles';
import { getWeightBalanceCalculations } from '@/data/weightBalance';
import { useAppTheme } from '@/theme/theme';

const displayDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};

export default function WeightBalanceScreen(): React.JSX.Element {
  const db = useSQLiteContext(); const queryClient = useQueryClient(); const { colors } = useAppTheme();
  const { plannedFlightId, calculationDate } = useLocalSearchParams<{ plannedFlightId?: string; calculationDate?: string }>();
  const ready = useQuery({ queryKey: ['ready-aircraft-profiles'], queryFn: () => getReadyAircraftProfiles(db) });
  const all = useQuery({ queryKey: ['aircraft-profiles'], queryFn: () => getAircraftProfiles(db) });
  const calculations = useQuery({ queryKey: ['weight-balance-calculations'], queryFn: () => getWeightBalanceCalculations(db) });
  useFocusEffect(useCallback(() => { void Promise.all([queryClient.invalidateQueries({ queryKey: ['ready-aircraft-profiles'] }), queryClient.invalidateQueries({ queryKey: ['aircraft-profiles'] }), queryClient.invalidateQueries({ queryKey: ['weight-balance-calculations'] })]); }, [queryClient]));
  const loading = ready.isLoading || calculations.isLoading;
  const showSavedCalculationInformation = () => Alert.alert('Saved calculations', 'Saved calculations are immutable snapshots. You can attach a standalone calculation to a logbook entry later.');
  return <><Stack.Screen options={{ title: 'Mass and Balance', headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="About saved calculations" hitSlop={9} onPress={showSavedCalculationInformation}><Ionicons name="information-circle-outline" size={23} color={colors.text} /></Pressable> }} /><Screen>
    {loading ? <StateNotice loading title="Loading mass and balance" /> : ready.data?.length ? <><Text style={[styles.sectionTitle, { color: colors.text }]}>New calculation</Text>{ready.data.map((profile) => <Pressable key={profile.id} onPress={() => router.push({ pathname: '/weight-balance-entry', params: { profileId: profile.id, plannedFlightId, calculationDate } })} style={({ pressed }) => [styles.aircraftCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}><View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="scale-outline" size={23} color={colors.primary} /></View><View style={styles.copy}><Text style={[styles.registration, { color: colors.text }]}>{profile.registration}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{profile.manufacturer} {profile.model} · Revision {profile.revision}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></Pressable>)}</> : <StateNotice icon="scale-outline" title="No ready aircraft profiles" body={all.data?.length ? 'Complete a draft profile before running a calculation.' : 'Add an aircraft profile from its approved mass and balance data first.'} actionLabel={all.data?.length ? 'Review aircraft' : 'Add aircraft'} onAction={() => router.push('/aircraft')} />}
    {!plannedFlightId && (calculations.data?.length ?? 0) > 0 ? <><View style={styles.sectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>Saved calculations</Text><Text style={[styles.count, { color: colors.textMuted }]}>{calculations.data!.length}</Text></View>{calculations.data!.map((calculation) => <Pressable key={calculation.id} onPress={() => router.push({ pathname: '/weight-balance-entry', params: { calculationId: calculation.id } })} style={({ pressed }) => [styles.savedCard, { backgroundColor: colors.surface, borderColor: calculation.result.valid ? colors.border : colors.danger, opacity: pressed ? 0.75 : 1 }]}><View style={styles.savedTop}><View><Text style={[styles.savedTitle, { color: colors.text }]}>{calculation.title || calculation.registration}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{calculation.registration} · {displayDate(calculation.calculationDate)}</Text></View><View style={[styles.status, { backgroundColor: calculation.result.valid ? colors.primarySoft : colors.surfaceRaised }]}><Text style={[styles.statusText, { color: calculation.result.valid ? colors.success : colors.danger }]}>{calculation.result.valid ? 'Within limits' : 'Check limits'}</Text></View></View><Text style={[styles.link, { color: colors.textMuted }]}>{calculation.logbookFlightId ? 'Attached to a logbook entry' : 'Not attached'}</Text></Pressable>)}</> : null}
  </Screen></>;
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 20, fontWeight: '900' }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }, count: { fontSize: 11, fontWeight: '800' }, aircraftCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, registration: { fontSize: 18, fontWeight: '900' }, meta: { fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 2 }, savedCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 14, gap: 8 }, savedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, savedTitle: { fontSize: 16, fontWeight: '900' }, status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, statusText: { fontSize: 9, fontWeight: '900' }, link: { fontSize: 10, fontWeight: '700' }
});
