import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getAircraftProfile } from '@/data/aircraftProfiles';
import { saveCalculationToPlannedFlight } from '@/data/plannedFlights';
import { deleteWeightBalanceCalculation, getWeightBalanceCalculation, saveWeightBalanceCalculation } from '@/data/weightBalance';
import type { AircraftProfile, AircraftStation } from '@/domain/aircraft';
import { calculateFuelPlan, calculateWeightBalance, type StationLoadInput, type WeightBalanceStateName } from '@/domain/weightBalance';
import { useAppTheme, type AppColors } from '@/theme/theme';

const numberValue = (value: string): number => Number.parseFloat(value.replace(',', '.')) || 0;
const stateLabel: Record<WeightBalanceStateName, string> = { RAMP: 'Ramp', TAKEOFF: 'Takeoff', LANDING: 'Landing' };
const formatVolume = (value: number): string => value.toFixed(1);
const formatArm = (value: number, unit: AircraftProfile['armUnit']): string => value.toFixed(unit === 'M' ? 3 : unit === 'CM' ? 1 : unit === 'IN' ? 2 : 0);

function LoadField({ label, value, unit, onChange, colors }: { label: string; value: number; unit: string; onChange: (value: number) => void; colors: AppColors }) {
  const [draft, setDraft] = useState(() => value ? String(value) : '');
  if (label === 'Title' && !unit) return <Text style={[styles.label, { color: colors.textMuted }]}>Title</Text>;
  return <View style={styles.loadField}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><View style={[styles.inputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><TextInput value={draft} onChangeText={(text) => { setDraft(text); onChange(numberValue(text)); }} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.input, { color: colors.text }]} /><Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text></View></View>;
}

const formatDuration = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
const parseDuration = (value: string): number => {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

function DurationField({ label, value, minimumMinutes = 0, onChange, colors }: { label: string; value: number; minimumMinutes?: number; onChange: (value: number) => void; colors: AppColors }) {
  const [draft, setDraft] = useState(() => formatDuration(value));
  const finish = () => {
    const next = Math.max(minimumMinutes, parseDuration(draft));
    setDraft(formatDuration(next));
    onChange(next);
  };
  return <View style={styles.loadField}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><View style={[styles.inputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><TextInput value={draft} onChangeText={(text) => { setDraft(text); onChange(Math.max(minimumMinutes, parseDuration(text))); }} onBlur={finish} placeholder={formatDuration(minimumMinutes)} placeholderTextColor={colors.textMuted} keyboardType="default" autoCapitalize="none" style={[styles.input, { color: colors.text }]} /><Text style={[styles.unit, { color: colors.textMuted }]}>h:mm</Text></View></View>;
}

function FuelOnBoardField({ value, suggested, unit, onChange, colors }: { value: number; suggested: number; unit: string; onChange: (value: number) => void; colors: AppColors }) {
  const [draft, setDraft] = useState(() => value ? String(value) : '');
  const useTotal = () => { const next = Number(suggested.toFixed(2)); setDraft(String(next)); onChange(next); };
  return <View style={styles.fuelOnBoard}><View style={styles.fuelOnBoardHeading}><Text style={[styles.label, { color: colors.textMuted }]}>Fuel on board</Text><Pressable accessibilityRole="button" onPress={useTotal} style={[styles.useTotal, { backgroundColor: colors.primarySoft }]}><Text style={[styles.useTotalText, { color: colors.primary }]}>Use total fuel load</Text></Pressable></View><View style={[styles.inputWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}><TextInput value={draft} onChangeText={(text) => { setDraft(text); onChange(numberValue(text)); }} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" style={[styles.input, { color: colors.text }]} /><Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text></View></View>;
}

function FuelSummary({ load, unit, colors }: { load: StationLoadInput; unit: string; colors: AppColors }) {
  const plan = calculateFuelPlan(load);
  const values = [
    ['Minimum fuel', plan.minimumVolume],
    ['Total fuel load', plan.totalVolume],
    ['Takeoff fuel', plan.takeoffVolume],
    ['Planned landing fuel', plan.landingVolume]
  ] as const;
  return <><Text style={[styles.fuelBreakdown, { color: colors.textMuted }]}>Cruise {formatVolume(plan.cruiseVolume)} {unit} · Contingency {formatVolume(plan.contingencyVolume)} {unit} · Reserve {formatVolume(plan.reserveVolume)} {unit}</Text><View style={styles.fuelSummary}>{values.map(([label, value]) => <View key={label} style={[styles.fuelSummaryItem, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.summaryValue, { color: colors.text }]}>{formatVolume(value)} {unit}</Text></View>)}</View>{plan.safeEnduranceMinutes > 0 ? <Text style={[styles.fuelBreakdown, { color: colors.textMuted }]}>Safe endurance excluding reserve: {formatDuration(plan.safeEnduranceMinutes)}</Text> : null}</>;
}

function SavedFuelPlan({ profile, loads }: { profile: AircraftProfile; loads: StationLoadInput[] }) {
  const { colors } = useAppTheme();
  const fuelStations = profile.stations.filter((station) => station.type === 'FUEL').flatMap((station) => {
    const load = loads.find((item) => item.stationId === station.id);
    return load && calculateFuelPlan(load).hasPlanningData ? [{ station, load }] : [];
  });
  if (!fuelStations.length) return null;
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Fuel plan</Text>{fuelStations.map(({ station, load }) => <View key={station.id} style={styles.savedFuelStation}>{fuelStations.length > 1 ? <Text style={[styles.stationName, { color: colors.text }]}>{station.name}</Text> : null}<FuelSummary load={load} unit={profile.fuelVolumeUnit} colors={colors} /></View>)}</View>;
}

export default function WeightBalanceEntryScreen(): React.JSX.Element {
  const { profileId, calculationId, plannedFlightId, calculationDate } = useLocalSearchParams<{ profileId?: string; calculationId?: string; plannedFlightId?: string; calculationDate?: string }>();
  const db = useSQLiteContext(); const queryClient = useQueryClient(); const { colors } = useAppTheme();
  const saved = useQuery({ queryKey: ['weight-balance-calculation', calculationId], queryFn: () => getWeightBalanceCalculation(db, calculationId!), enabled: Boolean(calculationId) });
  const resolvedProfileId = profileId ?? saved.data?.profileId;
  const profile = useQuery({ queryKey: ['aircraft-profile', resolvedProfileId], queryFn: () => getAircraftProfile(db, resolvedProfileId!), enabled: Boolean(resolvedProfileId) });
  const [title, setTitle] = useState(''); const [date, setDate] = useState(calculationDate ?? new Date().toISOString().slice(0, 10)); const [loads, setLoads] = useState<StationLoadInput[]>([]); const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!profile.data || calculationId) return;
    // A new calculation receives one empty input row per station after its profile loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoads(profile.data.stations.map((station) => station.type === 'FUEL'
      ? { stationId: station.id, mass: 0, blockVolume: 0, taxiVolume: 0, tripVolume: 0, cruiseMinutes: 0, fuelFlowPerHour: 0, contingencyPercent: 0, approachDepartureVolume: 0, reserveMinutes: 30, extraVolume: 0 }
      : { stationId: station.id, mass: 0, blockVolume: 0, taxiVolume: 0, tripVolume: 0 }));
  }, [profile.data, calculationId]);
  const input = useMemo(() => ({ title: title.trim() || `${profile.data?.registration ?? 'Aircraft'} calculation`, calculationDate: date, stationLoads: loads }), [title, date, loads, profile.data?.registration]);
  const result = saved.data?.result ?? (profile.data && loads.length ? calculateWeightBalance(profile.data, input) : null);
  const updateLoad = (stationId: string, patch: Partial<StationLoadInput>) => setLoads((current) => current.map((load) => load.stationId === stationId ? { ...load, ...patch } : load));
  const save = async () => {
    if (!profile.data || !result) return;
    try {
      setSaving(true);
      const calculation = { profileId: profile.data.id, profileGroupId: profile.data.groupId, profileRevision: profile.data.revision, registration: profile.data.registration, title: input.title, calculationDate: input.calculationDate, input, result };
      const calculationId = plannedFlightId ? await saveCalculationToPlannedFlight(db, plannedFlightId, calculation) : await saveWeightBalanceCalculation(db, calculation);
      void queryClient.invalidateQueries({ queryKey: ['weight-balance-calculations'] });
      if (plannedFlightId) {
        await queryClient.invalidateQueries({ queryKey: ['planned-flight', plannedFlightId] });
        void queryClient.invalidateQueries({ queryKey: ['planned-flights'] });
        router.dismissTo({ pathname: '/flight-plan', params: { id: plannedFlightId } });
      } else router.replace({ pathname: '/weight-balance-entry', params: { calculationId } });
    } catch (error) { Alert.alert('Could not save calculation', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };

  const remove = () => calculationId && Alert.alert('Delete calculation?', saved.data?.logbookFlightId ? 'This will also remove the attachment from its logbook entry.' : 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteWeightBalanceCalculation(db, calculationId).then(() => { void queryClient.invalidateQueries({ queryKey: ['weight-balance-calculations'] }); router.dismissTo('/weight-balance'); }) }]);
  if ((calculationId && saved.isLoading) || profile.isLoading) return <Screen scroll={false}><StateNotice loading title="Loading calculation" /></Screen>;
  if (!profile.data || (calculationId && !saved.data)) return <Screen scroll={false}><StateNotice title="Calculation unavailable" body="The aircraft profile or saved calculation could not be found." /></Screen>;
  const aircraft = profile.data; const readOnly = Boolean(saved.data);
  return <><Stack.Screen options={{ title: readOnly ? saved.data!.title : aircraft.registration }} /><Screen>
    <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}><View><Text style={[styles.registration, { color: colors.text }]}>{aircraft.registration}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{aircraft.manufacturer} {aircraft.model} · Profile revision {saved.data?.profileRevision ?? aircraft.revision}</Text></View><View style={[styles.ready, { backgroundColor: colors.primarySoft }]}><Text style={[styles.readyText, { color: colors.success }]}>Ready profile</Text></View></View>
    {!readOnly ? <><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Calculation</Text><Text style={[styles.label, { color: colors.textMuted }]}>Title</Text><TextInput value={title} onChangeText={setTitle} placeholder="Weekend local flight" placeholderTextColor={colors.textMuted} style={[styles.textInput, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /><Text style={[styles.label, { color: colors.textMuted }]}>Date</Text><TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[styles.textInput, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /></View>{aircraft.stations.map((station) => <StationCard key={station.id} station={station} load={loads.find((item) => item.stationId === station.id)} profile={aircraft} onChange={(patch) => updateLoad(station.id, patch)} />)}</> : null}
    {result ? <><View style={[styles.card, { backgroundColor: colors.surface, borderColor: result.valid ? colors.border : colors.danger }]}><View style={styles.resultHeading}><Text style={[styles.cardTitle, { color: colors.text }]}>Result</Text><View style={[styles.resultStatus, { backgroundColor: result.valid ? colors.primarySoft : colors.surfaceRaised }]}><Ionicons name={result.valid ? 'checkmark-circle' : 'warning'} size={16} color={result.valid ? colors.success : colors.danger} /><Text style={[styles.resultStatusText, { color: result.valid ? colors.success : colors.danger }]}>{result.valid ? 'Within entered limits' : 'Not within limits'}</Text></View></View>{result.errors.map((error) => <Text key={error} style={[styles.error, { color: colors.danger }]}>• {error}</Text>)}{result.warnings.map((warning) => <View key={warning} style={styles.warningRow}><Ionicons name="warning-outline" size={16} color={colors.warning} /><Text style={[styles.warningText, { color: colors.warning }]}>{warning}</Text></View>)}{result.states.some((state) => state.name !== ('ZERO_FUEL' as string)) ? <View style={styles.states}>{result.states.filter((state) => state.name !== ('ZERO_FUEL' as string)).map((state) => <View key={state.name} style={[styles.state, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.stateName, { color: colors.textMuted }]}>{stateLabel[state.name]}</Text><Text style={[styles.stateValue, { color: colors.text }]}>{state.mass.toFixed(1)} {aircraft.massUnit}</Text><Text style={[styles.stateMeta, { color: colors.textMuted }]}>CG {formatArm(state.arm, aircraft.armUnit)} {aircraft.armUnit}</Text><Text style={[styles.stateLimit, { color: colors.textMuted }]}>Allowed {formatArm(state.forwardLimit, aircraft.armUnit)} to {formatArm(state.aftLimit, aircraft.armUnit)} {aircraft.armUnit}</Text></View>)}</View> : null}</View>{readOnly ? <SavedFuelPlan profile={aircraft} loads={saved.data!.input.stationLoads} /> : null}</> : null}
    {readOnly ? <View style={[styles.notice, { backgroundColor: colors.primarySoft }]}><Ionicons name="lock-closed-outline" size={19} color={colors.primary} /><Text style={[styles.noticeText, { color: colors.text }]}>This is an immutable snapshot. {saved.data!.logbookFlightId ? 'It is attached to a logbook entry.' : 'Attach it from a logbook entry when needed.'}</Text></View> : <Pressable disabled={saving || !result?.states.length} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.primary, opacity: saving || !result?.states.length ? 0.45 : 1 }]}><Text style={styles.saveText}>{saving ? 'Saving…' : plannedFlightId ? 'Save and attach to flight' : 'Save calculation'}</Text></Pressable>}
    {readOnly ? <Pressable onPress={remove} style={[styles.delete, { borderColor: colors.danger }]}><Text style={[styles.deleteText, { color: colors.danger }]}>Delete calculation</Text></Pressable> : null}
    <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Verify inputs and results against the approved aircraft documents before flight.</Text>
  </Screen></>;
}

function StationCard({ station, load, profile, onChange }: { station: AircraftStation; load?: StationLoadInput; profile: AircraftProfile; onChange: (patch: Partial<StationLoadInput>) => void }) {
  const { colors } = useAppTheme(); const current = load ?? { stationId: station.id, mass: 0, blockVolume: 0, taxiVolume: 0, tripVolume: 0 };
  if (station.type === 'FUEL') return <FuelStationCard station={station} load={current} profile={profile} onChange={onChange} />;
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.stationHeading}><Text style={[styles.cardTitle, { color: colors.text }]}>{station.name}</Text><Text style={[styles.stationType, { color: colors.textMuted }]}>Load</Text></View><LoadField label="Mass" value={current.mass} unit={profile.massUnit} onChange={(mass) => onChange({ mass })} colors={colors} />{station.maxMass !== null ? <Text style={[styles.help, { color: colors.textMuted }]}>Maximum {station.maxMass} {profile.massUnit}</Text> : null}</View>;
}

function FuelStationCard({ station, load, profile, onChange }: { station: AircraftStation; load: StationLoadInput; profile: AircraftProfile; onChange: (patch: Partial<StationLoadInput>) => void }) {
  const { colors } = useAppTheme(); const unit = profile.fuelVolumeUnit; const plan = calculateFuelPlan(load);
  const updatePlan = (patch: Partial<StationLoadInput>) => {
    const next = { ...load, ...patch };
    onChange({ ...patch, tripVolume: calculateFuelPlan(next).airborneVolume });
  };
  const showFuelInformation = () => Alert.alert('Fuel planning', 'Minimum fuel includes cruise, contingency, start and taxi, approach and departure, and reserve. Extra fuel is then added to produce the total fuel load. Fuel on board drives ramp mass, while the planned start, taxi, and airborne burns drive takeoff and landing mass. Reserve cannot be less than 30 minutes.');
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.stationHeading}><Text style={[styles.cardTitle, { color: colors.text }]}>{station.name}</Text><Pressable accessibilityRole="button" accessibilityLabel="About fuel planning" hitSlop={8} onPress={showFuelInformation}><Ionicons name="information-circle-outline" size={21} color={colors.primary} /></Pressable></View><View style={styles.row}><DurationField label="Cruise time" value={load.cruiseMinutes ?? 0} onChange={(cruiseMinutes) => updatePlan({ cruiseMinutes })} colors={colors} /><LoadField label="Consumption" value={load.fuelFlowPerHour ?? 0} unit={`${unit}/h`} onChange={(fuelFlowPerHour) => updatePlan({ fuelFlowPerHour })} colors={colors} /></View><View style={styles.row}><LoadField label="Contingency" value={load.contingencyPercent ?? 0} unit="%" onChange={(contingencyPercent) => updatePlan({ contingencyPercent })} colors={colors} /><LoadField label="Start and taxi" value={load.taxiVolume} unit={unit} onChange={(taxiVolume) => updatePlan({ taxiVolume })} colors={colors} /></View><View style={styles.row}><LoadField label="Approach and departure" value={load.approachDepartureVolume ?? 0} unit={unit} onChange={(approachDepartureVolume) => updatePlan({ approachDepartureVolume })} colors={colors} /><DurationField label="Reserve" value={load.reserveMinutes ?? 30} minimumMinutes={30} onChange={(reserveMinutes) => updatePlan({ reserveMinutes })} colors={colors} /></View><LoadField label="Extra fuel" value={load.extraVolume ?? 0} unit={unit} onChange={(extraVolume) => updatePlan({ extraVolume })} colors={colors} /><FuelSummary load={load} unit={unit} colors={colors} /><FuelOnBoardField value={load.blockVolume} suggested={plan.totalVolume} unit={unit} onChange={(blockVolume) => updatePlan({ blockVolume })} colors={colors} />{load.blockVolume > 0 && load.blockVolume < plan.totalVolume ? <View style={styles.warningRow}><Ionicons name="warning-outline" size={16} color={colors.warning} /><Text style={[styles.warningText, { color: colors.warning }]}>Fuel on board is below the planned total.</Text></View> : null}{station.maxVolume !== null ? <Text style={[styles.help, { color: colors.textMuted }]}>Maximum {station.maxVolume} {unit}</Text> : station.maxMass !== null ? <Text style={[styles.help, { color: colors.textMuted }]}>Maximum {station.maxMass} {profile.massUnit}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 19, padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, registration: { fontSize: 22, fontWeight: '900' }, meta: { fontSize: 10, marginTop: 3, fontWeight: '700' }, ready: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, readyText: { fontSize: 9, fontWeight: '900' }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 12 }, cardTitle: { fontSize: 20, fontWeight: '900' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, loadField: { flex: 1, minWidth: 92, gap: 5 }, label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' }, inputWrap: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11 }, input: { flex: 1, fontSize: 15, fontWeight: '800', padding: 0 }, unit: { fontSize: 9, fontWeight: '900' }, textInput: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 11, fontSize: 14, fontWeight: '700' }, stationHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, stationType: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 }, resultStatus: { borderRadius: 999, flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6 }, resultStatusText: { fontSize: 9, fontWeight: '900' }, error: { fontSize: 11, lineHeight: 17, fontWeight: '700' }, warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, warningText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '800' }, states: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, state: { width: '48%', flexGrow: 1, borderRadius: 13, padding: 11 }, stateName: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, stateValue: { fontSize: 17, fontWeight: '900', marginTop: 3 }, stateMeta: { fontSize: 10, fontWeight: '700', marginTop: 2 }, stateLimit: { fontSize: 8, fontWeight: '700', marginTop: 2 }, help: { fontSize: 10, lineHeight: 15 }, fuelBreakdown: { fontSize: 9, lineHeight: 14, fontWeight: '700' }, fuelSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, fuelSummaryItem: { width: '48%', flexGrow: 1, borderRadius: 12, padding: 10 }, summaryLabel: { fontSize: 8, lineHeight: 12, fontWeight: '900', textTransform: 'uppercase' }, summaryValue: { fontSize: 14, fontWeight: '900', marginTop: 2 }, fuelOnBoard: { gap: 6 }, fuelOnBoardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, useTotal: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, useTotalText: { fontSize: 9, fontWeight: '900' }, savedFuelStation: { gap: 8 }, stationName: { fontSize: 13, fontWeight: '900' }, notice: { borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10 }, noticeText: { flex: 1, fontSize: 11, lineHeight: 17, fontWeight: '700' }, save: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, delete: { minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, deleteText: { fontSize: 13, fontWeight: '900' }, disclaimer: { textAlign: 'center', fontSize: 10, lineHeight: 15 }
});
