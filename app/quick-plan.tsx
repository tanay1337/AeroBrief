import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { getReadyAircraftProfiles } from '@/data/aircraftProfiles';
import { getAirport, getMostRecentAirport } from '@/data/database';
import { createPlannedFlight, getPlannedFlight, getPlannedFlights, type PlannedFlight } from '@/data/plannedFlights';
import { getRoutePlan, getRoutePlans, saveRoutePlan } from '@/data/routePlans';
import { validDepartureDate, validDepartureTime } from '@/domain/flightDetails';
import { calculateRoute, getAiracCycleAt, type RoutePlan, type RouteWaypoint } from '@/domain/routePlanning';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

export default function QuickPlanScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const { local } = useLocalSearchParams<{ local?: string }>();
  const client = useQueryClient();
  const { colors } = useAppTheme();
  const recent = useQuery({ queryKey: ['recent-airport'], queryFn: () => getMostRecentAirport(db) });
  const profiles = useQuery({ queryKey: ['ready-aircraft-profiles'], queryFn: () => getReadyAircraftProfiles(db) });
  const savedRoutes = useQuery({ queryKey: ['route-plans'], queryFn: () => getRoutePlans(db) });
  const drafts = useQuery({ queryKey: ['planned-flights'], queryFn: () => getPlannedFlights(db) });
  useFocusEffect(useCallback(() => {
    void client.invalidateQueries({ queryKey: ['planned-flights'] });
    void client.invalidateQueries({ queryKey: ['route-plans'] });
  }, [client]));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [localArea, setLocalArea] = useState(local === '1');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [profileId, setProfileId] = useState<string>('AUTO');
  const [busy, setBusy] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [fromTouched, setFromTouched] = useState(false);
  const { preferences, updatePreferences } = usePreferences();
  const departureValue = fromTouched ? from : preferences.mapStartAirport || recent.data?.weatherCode || recent.data?.ident || '';
  const selectedProfileId = profileId === 'AUTO' ? profiles.data?.find((profile) => profile.id === preferences.defaultAircraftProfileId)?.id ?? (profiles.data?.length === 1 ? profiles.data[0]!.id : null) : profileId === 'NONE' ? null : profileId;
  const draftRouteIds = new Set(drafts.data?.map((flight) => flight.routePlanId).filter(Boolean) ?? []);
  const previousRoutes = (savedRoutes.data ?? []).filter((route) => route.waypoints.length >= 2 && route.waypoints[0]?.source === 'AIRPORT' && route.waypoints.at(-1)?.source === 'AIRPORT' && (!draftRouteIds.has(route.id) || route.waypoints.length > 2)).slice(0, 8);

  const selectRoute = (route: RoutePlan) => {
    setSelectedRouteId(route.id);
    setShowSavedRoutes(false);
    setFrom(route.waypoints[0]!.ident);
    setFromTouched(true);
    setTo(route.waypoints.at(-1)!.ident);
    setLocalArea(route.waypoints[0]!.ident === route.waypoints.at(-1)!.ident);
  };

  const submit = async () => {
    const departureCode = departureValue.trim().toUpperCase();
    const arrivalCode = localArea ? departureCode : to.trim().toUpperCase();
    if (!validDepartureDate(date) || !validDepartureTime(time)) {
      Alert.alert('Check departure', 'Enter a valid UTC date (YYYY-MM-DD) and optional UTC time (HH:MM).'); return;
    }
    if (!departureCode || !arrivalCode) { Alert.alert('Choose airports', 'Enter a departure and destination, or select Local flight.'); return; }
    try {
      setBusy(true);
      const departure = await getAirport(db, departureCode);
      const arrival = await getAirport(db, arrivalCode);
      if (!departure || !arrival) { Alert.alert('Airport not found', `Check ${!departure ? departureCode : arrivalCode} against the airport database.`); return; }
      const ident = (airport: typeof departure) => airport.weatherCode || airport.ident;
      const point = (airport: typeof departure, index: number): RouteWaypoint => ({ id: `airport-${airport.id}-${index}`, ident: ident(airport), name: airport.name, latitude: airport.latitude, longitude: airport.longitude, source: 'AIRPORT' });
      const routeToCopy = selectedRouteId ? await getRoutePlan(db, selectedRouteId) : null;
      if (selectedRouteId && (!routeToCopy || routeToCopy.waypoints[0]?.ident !== ident(departure) || routeToCopy.waypoints.at(-1)?.ident !== ident(arrival))) {
        Alert.alert('Saved route changed', 'Select the route again or enter airports for a new flight.'); return;
      }
      let routeId = ''; let id = '';
      await db.withExclusiveTransactionAsync(async (tx) => {
        routeId = routeToCopy?.id ?? await saveRoutePlan(tx, {
        id: '', title: `${ident(departure)} to ${ident(arrival)}`, waypoints: [point(departure, 0), point(arrival, 1)],
        cruiseSpeedKt: null, fuelBurnPerHour: null, fuelUnit: 'L', windDirectionTrue: null,
        windSpeedKt: null, windSource: null, windStation: null, windStationDistanceKm: null,
        windObservedAt: null, airacCycle: getAiracCycleAt()
      });
        const persisted = await getRoutePlan(tx, routeId);
        if (!persisted) throw new Error('The route could not be read back. The flight was not created.');
        id = await createPlannedFlight(tx, { routePlanId: routeId, departureAirport: ident(departure), arrivalAirport: ident(arrival), departureDate: date, departureTime: time, aircraftProfileId: selectedProfileId, localArea }, !routeToCopy);
      });
      const persisted = await getRoutePlan(db, routeId);
      const created = await getPlannedFlight(db, id);
      if (!created) throw new Error('The flight could not be read back. Reopen Quick plan to check your saved flights.');
      client.setQueryData(['route-plan', routeId], persisted);
      client.setQueryData(['planned-flight', id], created);
      client.setQueryData<PlannedFlight[]>(['planned-flights'], (previous) => [created, ...(previous ?? []).filter((flight) => flight.id !== id)]);
      await client.invalidateQueries({ queryKey: ['planned-flights'] });
      await client.invalidateQueries({ queryKey: ['route-plans'] });
      if (selectedProfileId) void updatePreferences({ defaultAircraftProfileId: selectedProfileId }).catch(() => undefined);
      router.replace({ pathname: '/route-planner', params: { id: routeId, flightId: id } });
    } catch (error) {
      Alert.alert('Could not create flight', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  return <Screen>
    <View><Text style={[styles.title, { color: colors.text }]}>Where are you flying?</Text><Text style={[styles.sub, { color: colors.textMuted }]}>Start with your route. Add waypoints and performance on the map.</Text></View>
    {previousRoutes.length ? <View style={styles.group}><Pressable accessibilityRole="button" accessibilityState={{ expanded: showSavedRoutes }} onPress={() => setShowSavedRoutes(!showSavedRoutes)} style={[styles.savedRow, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="folder-open-outline" size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.savedTitle, { color: colors.text }]}>{selectedRouteId ? savedRoutes.data?.find((route) => route.id === selectedRouteId)?.title : 'Use a saved route'}</Text><Text style={[styles.sub, { color: colors.textMuted }]}>{selectedRouteId ? 'Saved route selected · tap to change' : 'Optional · reuse a previous route'}</Text></View><Ionicons name={showSavedRoutes ? 'chevron-up' : 'chevron-down'} size={19} color={colors.primary} /></Pressable>{showSavedRoutes ? previousRoutes.map((route) => <Pressable key={route.id} accessibilityRole="button" accessibilityLabel={`Use saved route ${route.title}`} onPress={() => selectRoute(route)} style={[styles.savedRow, { backgroundColor: selectedRouteId === route.id ? colors.primarySoft : colors.surface, borderColor: selectedRouteId === route.id ? colors.primary : colors.border }]}><Ionicons name="navigate-outline" size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.savedTitle, { color: colors.text }]}>{route.title}</Text><Text numberOfLines={1} style={[styles.sub, { color: colors.textMuted }]}>{route.waypoints.map((point) => point.ident).join(' → ')} · {calculateRoute(route.waypoints, null, null, null, null).distanceNm.toFixed(1)} NM</Text></View><Ionicons name={selectedRouteId === route.id ? 'checkmark-circle' : 'chevron-forward'} size={19} color={colors.primary} /></Pressable>) : null}</View> : null}

    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>FROM · ICAO</Text>
      <TextInput accessibilityLabel="Departure airport ICAO" autoCapitalize="characters" autoCorrect={false} value={departureValue} onChangeText={(value) => { setSelectedRouteId(null); setFromTouched(true); setFrom(value); }} placeholder="e.g. EDAY" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: localArea }} onPress={() => { setSelectedRouteId(null); setLocalArea(!localArea); }} style={styles.choice}><Ionicons name={localArea ? 'checkbox' : 'square-outline'} size={23} color={colors.primary} /><Text style={[styles.choiceText, { color: colors.text }]}>Local flight · return to departure</Text></Pressable>
      {!localArea ? <><Text style={[styles.label, { color: colors.textMuted }]}>TO · ICAO</Text><TextInput accessibilityLabel="Destination airport ICAO" autoCapitalize="characters" autoCorrect={false} value={to} onChangeText={(value) => { setSelectedRouteId(null); setTo(value); }} placeholder="e.g. EDAZ" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, borderColor: colors.border }]} /></> : <Text style={[styles.sub, { color: colors.textMuted }]}>Add your local route points in Map before using the fuel estimate.</Text>}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDetails }} onPress={() => setShowDetails(!showDetails)} style={styles.choice}><Ionicons name="options-outline" size={21} color={colors.primary} /><Text style={[styles.choiceText, { color: colors.primary }]}>Flight details · {selectedProfileId ? profiles.data?.find((profile) => profile.id === selectedProfileId)?.registration : 'Aircraft later'}</Text><Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} /></Pressable>
    {showDetails ?     <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textMuted }]}>DEPARTURE · UTC</Text>
      <View style={styles.row}><TextInput accessibilityLabel="Departure date in UTC" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1.4, color: colors.text, borderColor: colors.border }]} /><TextInput accessibilityLabel="Departure time in UTC" value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.textMuted} style={[styles.input, { flex: 1, color: colors.text, borderColor: colors.border }]} /></View>
      <Text style={[styles.label, { color: colors.textMuted }]}>AIRCRAFT</Text>
      <View style={styles.wrap}><Pressable onPress={() => setProfileId('NONE')} style={[styles.pill, { backgroundColor: selectedProfileId === null ? colors.primarySoft : colors.surfaceRaised }]}><Text style={{ color: colors.text }}>Select later</Text></Pressable>{profiles.data?.map((profile) => <Pressable key={profile.id} onPress={() => setProfileId(profile.id)} style={[styles.pill, { backgroundColor: selectedProfileId === profile.id ? colors.primarySoft : colors.surfaceRaised }]}><Text style={{ color: colors.text }}>{profile.registration}</Text></Pressable>)}</View>
      {!profiles.data?.length ? <Text style={[styles.sub, { color: colors.textMuted }]}>You can add an aircraft profile under More later.</Text> : null}
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Show route and start draft" disabled={busy} onPress={() => void submit()} style={[styles.primary, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}><Text style={styles.primaryText}>{busy ? 'Creating…' : 'Show route'}</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" /></Pressable>

  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '900', marginBottom: 4 }, sub: { fontSize: 13, lineHeight: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 11 }, label: { fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 48, fontSize: 16 },
  choice: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 9 }, choiceText: { fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, pill: { padding: 10, borderRadius: 10 },
  primary: { minHeight: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  group: { gap: 9, paddingTop: 15 }, groupTitle: { fontSize: 20, fontWeight: '900' }, savedRow: { borderWidth: 1, minHeight: 70, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 12 }, savedTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 }
});
