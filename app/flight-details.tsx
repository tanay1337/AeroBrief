import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getReadyAircraftProfiles } from '@/data/aircraftProfiles';
import { saveFlightDetails, type FlightDetailsInput } from '@/data/flightDetails';
import { getPlannedFlight } from '@/data/plannedFlights';
import { validDepartureDate, validDepartureTime } from '@/domain/flightDetails';
import { LatestAutosave } from '@/domain/latestAutosave';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

export default function FlightDetailsScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext(); const client = useQueryClient(); const { colors } = useAppTheme();
  const { updatePreferences } = usePreferences();
  const flight = useQuery({ queryKey: ['planned-flight', id], queryFn: () => getPlannedFlight(db, id!), enabled: Boolean(id) });
  const profiles = useQuery({ queryKey: ['ready-aircraft-profiles'], queryFn: () => getReadyAircraftProfiles(db) });
  const [draft, setInput] = useState<FlightDetailsInput | null>(null);
  const input = draft ?? (flight.data ? { departureDate: flight.data.departureDate, departureTime: flight.data.departureTime, aircraftProfileId: flight.data.aircraftProfileId } : null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [message, setMessage] = useState('');
  const write = useCallback(async (value: FlightDetailsInput) => {
    try {
      const saved = await saveFlightDetails(db, id!, value);
      client.setQueryData(['planned-flight', id], saved);
      await client.invalidateQueries({ queryKey: ['planned-flights'] });
      await client.invalidateQueries({ queryKey: ['route-plans'] });
      if (value.aircraftProfileId) void updatePreferences({ defaultAircraftProfileId: value.aircraftProfileId }).catch(() => undefined);
      setMessage('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save details.'); throw error; }
  }, [client, db, id, updatePreferences]);
  const [autosave] = useState(() => new LatestAutosave<FlightDetailsInput>(async () => undefined, setStatus));
  useEffect(() => { autosave.setWriter(write); }, [autosave, write]);
  const valid = !input || (validDepartureDate(input.departureDate) && validDepartureTime(input.departureTime));
  const change = (patch: Partial<FlightDetailsInput>) => {
    if (!input) return;
    const next = { ...input, ...patch }; setInput(next);
    if (validDepartureDate(next.departureDate) && validDepartureTime(next.departureTime)) autosave.enqueue(next);
  };
  const navigation = useNavigation(); const [leave, setLeave] = useState<NavigationAction | null>(null);
  usePreventRemove(!valid || status !== 'saved', ({ data }) => {
    if (!valid) { Alert.alert('Check departure', 'Complete a valid UTC date and time, or clear the fields to select them later.'); return; }
    setLeave(data.action);
    void autosave.flush().catch(() => { setLeave(null); Alert.alert('Details not saved', 'Retry before leaving.'); });
  });
  useEffect(() => { if (status === 'saved' && leave) {
    // Resume the navigation action after its asynchronous local write.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeave(null); navigation.dispatch(leave); } }, [status, leave, navigation]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') void autosave.flush().catch(() => undefined); });
    return () => { listener.remove(); void autosave.flush().catch(() => undefined); };
  }, [autosave]);
  return <><Stack.Screen options={{ title: 'Flight details' }} /><Screen>
    {!input ? <StateNotice title={flight.isError ? 'Could not load flight' : 'Loading details'} loading={flight.isLoading} /> : <>
      <Text style={[styles.title, { color: colors.text }]}>Details when you need them</Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Departure · UTC</Text>
        <Text style={{ color: colors.textMuted }}>Optional while drafting. Set a date before finishing planning.</Text>
        <TextInput accessibilityLabel="Departure date in UTC" value={input.departureDate} onChangeText={(value) => change({ departureDate: value })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        <TextInput accessibilityLabel="Departure time in UTC" value={input.departureTime} onChangeText={(value) => change({ departureTime: value })} placeholder="HH:MM (optional)" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
        {!valid ? <Text style={{ color: colors.warning }}>Complete the date/time or leave blank.</Text> : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>Aircraft</Text>
        <Text style={{ color: colors.textMuted }}>Changing aircraft removes the attached loading calculation and clears TAS and fuel burn. Enter performance for the new aircraft in the route editor.</Text>
        {[{ id: '', registration: 'Select later' }, ...(profiles.data ?? [])].map((profile) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: (input.aircraftProfileId ?? '') === profile.id }} key={profile.id} onPress={() => change({ aircraftProfileId: profile.id || null })} style={[styles.row, { borderColor: colors.border }]}><Text style={{ color: colors.text, flex: 1 }}>{profile.registration}</Text><Ionicons name={(input.aircraftProfileId ?? '') === profile.id ? 'radio-button-on' : 'radio-button-off'} size={23} color={colors.primary} /></Pressable>)}
        {profiles.isError ? <Pressable onPress={() => void profiles.refetch()}><Text style={{ color: colors.primary }}>Retry aircraft</Text></Pressable> : null}
        {!profiles.isLoading && !profiles.data?.length ? <Pressable onPress={() => router.push('/aircraft')}><Text style={{ color: colors.primary }}>Add an aircraft profile</Text></Pressable> : null}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ color: status === 'error' ? colors.danger : colors.textMuted }}>{status === 'saving' ? 'Saving locally…' : status === 'error' ? message : 'Saved locally'}</Text>
      {status === 'error' ? <Pressable onPress={() => void autosave.flush().catch(() => undefined)}><Text style={{ color: colors.primary }}>Retry autosave</Text></Pressable> : null}
      <Pressable onPress={() => router.dismissTo({ pathname: '/flight-plan', params: { id: id! } })} style={[styles.done, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>Back to flight</Text></Pressable>
    </>}
  </Screen></>;
}
const styles = StyleSheet.create({ title: { fontSize: 24, fontWeight: '900' }, card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 }, row: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, done: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } });
