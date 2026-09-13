import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Screen } from '@/components/Screen';
import { deleteAircraftProfile, getAircraftProfile, saveAircraftProfile } from '@/data/aircraftProfiles';
import { validateAircraftProfile, type AircraftArmUnit, type AircraftEnvelopePoint, type AircraftMassUnit, type AircraftProfileInput, type AircraftStation, type AircraftStationMethod, type AircraftStationType, type FuelVolumeUnit } from '@/domain/aircraft';
import { useAppTheme, type AppColors } from '@/theme/theme';

type FieldProps = { label: string; value: string; onChange: (value: string) => void; placeholder?: string; numeric?: boolean; wide?: boolean; autoCapitalize?: TextInputProps['autoCapitalize']; colors: AppColors };
function Field({ label, value, onChange, placeholder, numeric, wide, autoCapitalize, colors }: FieldProps): React.JSX.Element {
  return <View style={wide ? styles.wideField : styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize={autoCapitalize ?? (numeric ? 'none' : 'sentences')} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /></View>;
}

const numberValue = (value: string): number => Number.parseFloat(value.replace(',', '.')) || 0;
const optionalNumber = (value: string): number | null => value.trim() ? numberValue(value) : null;
const displayNumber = (value: number | null): string => value === null || value === 0 ? '' : String(value);

type DecimalFieldProps = { label: string; value: number | null; onChange: (value: number | null) => void; wide?: boolean; colors: AppColors };
function DecimalField({ label, value, onChange, wide, colors }: DecimalFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(() => displayNumber(value));
  const update = (next: string) => {
    setDraft(next);
    onChange(next.trim() ? optionalNumber(next) : null);
  };
  return <Field label={label} value={draft} onChange={update} numeric wide={wide} colors={colors} />;
}
const pointsText = (points: { mass: number; arm?: number; moment?: number }[], key: 'arm' | 'moment') => points.map((point) => `${point.mass}, ${point[key]}`).join('\n');
function parsePairs(value: string): [number, number][] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const pair = line.split(/[,;\s]+/).filter(Boolean).map((item) => Number.parseFloat(item.replace(',', '.')));
    if (pair.length !== 2 || pair.some((item) => !Number.isFinite(item))) throw new Error(`Check line ${index + 1}: use “mass, value”.`);
    return [pair[0]!, pair[1]!];
  });
}
function parseEnvelope(value: string, side: 'FORWARD' | 'AFT'): AircraftEnvelopePoint[] { return parsePairs(value).map(([mass, arm], sortOrder) => ({ side, mass, arm, sortOrder })); }
function parseMomentPoints(value: string): { mass: number; moment: number }[] { return parsePairs(value).map(([mass, moment]) => ({ mass, moment })); }
const parsePoints = parseMomentPoints;

const newStation = (index: number): AircraftStation => ({ id: `draft-station-${Date.now()}-${index}`, name: '', type: 'OCCUPANT', method: 'FIXED_ARM', arm: null, maxMass: null, maxVolume: null, momentPoints: [], sortOrder: index });

export default function AircraftEntryScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const existing = useQuery({ queryKey: ['aircraft-profile', id], queryFn: () => getAircraftProfile(db, id!), enabled: Boolean(id) });
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [registration, setRegistration] = useState(''); const [manufacturer, setManufacturer] = useState(''); const [model, setModel] = useState(''); const [serialNumber, setSerialNumber] = useState('');
  const [massUnit, setMassUnit] = useState<AircraftMassUnit>('KG'); const [armUnit, setArmUnit] = useState<AircraftArmUnit>('MM'); const [fuelVolumeUnit, setFuelVolumeUnit] = useState<FuelVolumeUnit>('L');
  const [emptyMass, setEmptyMass] = useState(''); const [emptyMoment, setEmptyMoment] = useState(''); const [maxRamp, setMaxRamp] = useState(''); const [maxTakeoff, setMaxTakeoff] = useState(''); const [maxLanding, setMaxLanding] = useState(''); const [fuelDensity, setFuelDensity] = useState('');
  const [sourceReference, setSourceReference] = useState(''); const [sourceDate, setSourceDate] = useState(''); const [stations, setStations] = useState<AircraftStation[]>([newStation(0)]); const [forwardText, setForwardText] = useState(''); const [aftText, setAftText] = useState('');

  useEffect(() => {
    const profile = existing.data; if (!profile) return;
    // The persisted profile hydrates the editable draft after the database query completes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegistration(profile.registration); setManufacturer(profile.manufacturer); setModel(profile.model); setSerialNumber(profile.serialNumber); setMassUnit(profile.massUnit); setArmUnit(profile.armUnit); setFuelVolumeUnit(profile.fuelVolumeUnit);
    setEmptyMass(String(profile.emptyMass)); setEmptyMoment(String(profile.emptyMoment)); setMaxRamp(displayNumber(profile.maxRampMass)); setMaxTakeoff(String(profile.maxTakeoffMass)); setMaxLanding(displayNumber(profile.maxLandingMass)); setFuelDensity(displayNumber(profile.fuelDensity));
    setSourceReference(profile.sourceReference); setSourceDate(profile.sourceDate); setStations(profile.stations); setForwardText(pointsText(profile.envelope.filter((point) => point.side === 'FORWARD'), 'arm')); setAftText(pointsText(profile.envelope.filter((point) => point.side === 'AFT'), 'arm'));
  }, [existing.data]);

  const updateStation = (index: number, patch: Partial<AircraftStation>) => setStations((current) => current.map((station, itemIndex) => itemIndex === index ? { ...station, ...patch } : station));
  const build = (): AircraftProfileInput => ({
    id: existing.data?.id, groupId: existing.data?.groupId, revision: existing.data?.revision, registration, manufacturer, model, serialNumber,
    massUnit, armUnit, fuelVolumeUnit, emptyMass: numberValue(emptyMass), emptyMoment: numberValue(emptyMoment), maxRampMass: optionalNumber(maxRamp), maxTakeoffMass: numberValue(maxTakeoff), maxLandingMass: optionalNumber(maxLanding), maxZeroFuelMass: null, fuelDensity: optionalNumber(fuelDensity), sourceReference, sourceDate,
    stations: stations.map((station, index) => ({ ...station, sortOrder: index })), envelope: [...parseEnvelope(forwardText, 'FORWARD'), ...parseEnvelope(aftText, 'AFT')]
  });
  const validation = (() => { try { return validateAircraftProfile(build()); } catch (error) { return { ready: false, errors: [error instanceof Error ? error.message : 'Check the entered values.'] }; } })();

  const save = async (makeReady: boolean) => {
    if (makeReady && !confirmed) { Alert.alert('Confirm the source', 'Confirm that every value was copied from the approved, current aircraft documents.'); return; }
    try {
      setSaving(true); await saveAircraftProfile(db, build(), makeReady);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['aircraft-profiles'] }), queryClient.invalidateQueries({ queryKey: ['ready-aircraft-profiles'] })]);
      router.dismissTo('/aircraft');
    } catch (error) { Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Check the entered values.'); } finally { setSaving(false); }
  };
  const remove = () => id && Alert.alert('Delete aircraft profile?', 'Saved calculations may require this profile and will prevent deletion.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteAircraftProfile(db, id).then(() => { void queryClient.invalidateQueries({ queryKey: ['aircraft-profiles'] }); void queryClient.invalidateQueries({ queryKey: ['ready-aircraft-profiles'] }); router.back(); }).catch((error: unknown) => Alert.alert('Profile retained', error instanceof Error ? error.message : 'It could not be deleted.')) }]);

  return <><Stack.Screen options={{ title: id ? 'Aircraft profile' : 'Add aircraft' }} /><Screen>
    <View style={[styles.warning, { backgroundColor: colors.primarySoft }]}><Ionicons name="information-circle-outline" size={21} color={colors.primary} /><Text style={[styles.warningText, { color: colors.text }]}>Use only the approved, current aircraft flight manual, weighing report, or load sheet.</Text></View>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>Identity and units</Text><View style={styles.grid}><Field label="Registration" value={registration} onChange={setRegistration} placeholder="D-TEST" autoCapitalize="characters" colors={colors} /><Field label="Manufacturer" value={manufacturer} onChange={setManufacturer} placeholder="Diamond" autoCapitalize="words" colors={colors} /><Field label="Model" value={model} onChange={setModel} placeholder="DA20-A1" autoCapitalize="characters" colors={colors} /><Field label="Serial number" value={serialNumber} onChange={setSerialNumber} autoCapitalize="characters" colors={colors} /></View><Text style={[styles.label, { color: colors.textMuted }]}>Units</Text><View style={styles.chips}>{(['KG', 'LB'] as const).map((value) => <Chip key={value} label={value} active={massUnit === value} onPress={() => setMassUnit(value)} colors={colors} />)}{(['MM', 'CM', 'M', 'IN'] as const).map((value) => <Chip key={value} label={value} active={armUnit === value} onPress={() => setArmUnit(value)} colors={colors} />)}{(['L', 'US_GAL'] as const).map((value) => <Chip key={value} label={value} active={fuelVolumeUnit === value} onPress={() => setFuelVolumeUnit(value)} colors={colors} />)}</View></View>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>Empty aircraft and limits</Text><View style={styles.grid}><Field label={`Empty mass (${massUnit})`} value={emptyMass} onChange={setEmptyMass} numeric colors={colors} /><Field label={`Empty moment (${massUnit}·${armUnit})`} value={emptyMoment} onChange={setEmptyMoment} numeric colors={colors} /><Field label="Max ramp mass" value={maxRamp} onChange={setMaxRamp} numeric colors={colors} /><Field label="Max takeoff mass" value={maxTakeoff} onChange={setMaxTakeoff} numeric colors={colors} /><Field label="Max landing mass" value={maxLanding} onChange={setMaxLanding} numeric colors={colors} /><Field label={`Fuel density (${massUnit}/${fuelVolumeUnit})`} value={fuelDensity} onChange={setFuelDensity} numeric wide colors={colors} /></View></View>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.headingRow}><Text style={[styles.title, { color: colors.text }]}>Loading stations</Text><Pressable onPress={() => setStations((current) => [...current, newStation(current.length)])}><Ionicons name="add-circle-outline" size={25} color={colors.primary} /></Pressable></View>{stations.map((station, index) => <View key={station.id} style={[styles.station, { borderTopColor: colors.border }]}><View style={styles.headingRow}><Text style={[styles.stationTitle, { color: colors.text }]}>Station {index + 1}</Text>{stations.length > 1 ? <Pressable onPress={() => setStations((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable> : null}</View><Field label="Name" value={station.name} onChange={(value) => updateStation(index, { name: value })} placeholder="Front seats" wide colors={colors} /><View style={styles.chips}>{(['OCCUPANT', 'BAGGAGE', 'FUEL', 'OTHER'] as AircraftStationType[]).map((value) => <Chip key={value} label={value === 'OCCUPANT' ? 'People' : value.toLowerCase()} active={station.type === value} onPress={() => updateStation(index, { type: value })} colors={colors} />)}</View><View style={styles.chips}>{(['FIXED_ARM', 'MOMENT_TABLE'] as AircraftStationMethod[]).map((value) => <Chip key={value} label={value === 'FIXED_ARM' ? 'Fixed arm' : 'Moment table'} active={station.method === value} onPress={() => updateStation(index, { method: value })} colors={colors} />)}</View>{station.method === 'FIXED_ARM' ? <DecimalField label={`Arm (${armUnit})`} value={station.arm} onChange={(arm) => updateStation(index, { arm })} wide colors={colors} /> : <View style={styles.wideField}><Text style={[styles.label, { color: colors.textMuted }]}>Moment table: mass, moment</Text><TextInput multiline value={pointsText(station.momentPoints, 'moment')} onChangeText={(value) => { try { updateStation(index, { momentPoints: parsePoints(value) as { mass: number; moment: number }[] }); } catch { updateStation(index, { momentPoints: [] }); } }} placeholder={'0, 0\n50, 20500'} placeholderTextColor={colors.textMuted} style={[styles.multiline, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /></View>}<View style={styles.grid}><DecimalField label={`Max mass (${massUnit})`} value={station.maxMass} onChange={(maxMass) => updateStation(index, { maxMass })} colors={colors} />{station.type === 'FUEL' ? <DecimalField label={`Max volume (${fuelVolumeUnit})`} value={station.maxVolume} onChange={(maxVolume) => updateStation(index, { maxVolume })} colors={colors} /> : null}</View></View>)}</View>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>CG envelope</Text><Text style={[styles.help, { color: colors.textMuted }]}>Enter the exact numerical vertices from the approved source, one “mass, arm” pair per line. Add a point at every bend. The app will not infer points from a picture.</Text><View style={styles.grid}><View style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>Forward limit</Text><TextInput multiline value={forwardText} onChangeText={setForwardText} placeholder={'531.2, 240\n750, 260'} placeholderTextColor={colors.textMuted} style={[styles.multiline, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /></View><View style={styles.field}><Text style={[styles.label, { color: colors.textMuted }]}>Aft limit</Text><TextInput multiline value={aftText} onChangeText={setAftText} placeholder={'531.2, 330\n750, 330'} placeholderTextColor={colors.textMuted} style={[styles.multiline, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} /></View></View></View>
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.text }]}>Approved source</Text><View style={styles.grid}><Field label="Document and section" value={sourceReference} onChange={setSourceReference} placeholder="AFM section 6, revision 4" wide colors={colors} /><Field label="Source date" value={sourceDate} onChange={setSourceDate} placeholder="YYYY-MM-DD" autoCapitalize="none" wide colors={colors} /></View><Pressable onPress={() => setConfirmed((value) => !value)} style={styles.confirm}><Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={24} color={confirmed ? colors.primary : colors.textMuted} /><Text style={[styles.confirmText, { color: colors.text }]}>I checked every value against the approved, current source.</Text></Pressable></View>
    {!validation.ready ? <View style={[styles.validation, { borderColor: colors.warning }]}><Text style={[styles.validationTitle, { color: colors.warning }]}>Not ready for calculations</Text>{validation.errors.slice(0, 6).map((error) => <Text key={error} style={[styles.validationText, { color: colors.textMuted }]}>• {error}</Text>)}</View> : null}
    <View style={styles.actions}><Pressable disabled={saving} onPress={() => void save(false)} style={[styles.secondary, { borderColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primary }]}>Save Draft</Text></Pressable><Pressable disabled={saving || !validation.ready} onPress={() => void save(true)} style={[styles.primary, { backgroundColor: colors.primary, opacity: saving || !validation.ready ? 0.4 : 1 }]}><Text style={styles.primaryText}>{existing.data?.status === 'READY' ? 'Save new revision' : 'Mark Ready'}</Text></Pressable></View>
    {id ? <Pressable onPress={remove} style={[styles.delete, { borderColor: colors.danger }]}><Text style={[styles.buttonText, { color: colors.danger }]}>Delete profile</Text></Pressable> : null}
  </Screen></>;
}

function Chip({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: AppColors }) { return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.primary : colors.surfaceRaised }]}><Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.text }]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  warning: { borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10 }, warningText: { flex: 1, fontSize: 11, lineHeight: 17, fontWeight: '700' }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 13 }, title: { fontSize: 21, fontWeight: '900' }, stationTitle: { fontSize: 14, fontWeight: '900' }, headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, field: { width: '48%', gap: 5 }, wideField: { width: '100%', gap: 5 }, label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' }, input: { minHeight: 46, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, fontSize: 13, fontWeight: '700' }, multiline: { minHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 11, fontSize: 12, lineHeight: 19, textAlignVertical: 'top' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { borderRadius: 999, paddingHorizontal: 10, minHeight: 32, justifyContent: 'center' }, chipText: { fontSize: 10, fontWeight: '900', textTransform: 'capitalize' }, station: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, gap: 11 }, help: { fontSize: 11, lineHeight: 17 }, confirm: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, confirmText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' }, validation: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 }, validationTitle: { fontSize: 13, fontWeight: '900' }, validationText: { fontSize: 10, lineHeight: 15 }, actions: { flexDirection: 'row', gap: 10 }, primary: { flex: 1, minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, secondary: { flex: 1, minHeight: 50, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontSize: 13, fontWeight: '900' }, primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, delete: { minHeight: 48, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }
});
