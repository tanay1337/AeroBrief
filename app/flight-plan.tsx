import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlightRouteSummary } from '@/components/FlightRouteSummary';
import { PlannedNotamBriefing } from '@/components/PlannedNotamBriefing';
import { PlannedAerodromeBriefing } from '@/components/PlannedAerodromeBriefing';
import { capturePlannedWeatherBriefing, getValidPlannedWeatherBriefing } from '@/data/flightWeather';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getAircraftProfile } from '@/data/aircraftProfiles';
import { attachCalculationToPlannedFlight, deletePlannedFlight, getPlannedFlight, updatePlannedFlight } from '@/data/plannedFlights';
import { getRoutePlan, getRoutePlans } from '@/data/routePlans';
import { getWeightBalanceCalculation, getWeightBalanceCalculations } from '@/data/weightBalance';
import { checkRouteFuel } from '@/domain/routeFuelCheck';
import { calculateRoute } from '@/domain/routePlanning';
import { useAppTheme } from '@/theme/theme';

export default function FlightPlanScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const client = useQueryClient();
  const { colors } = useAppTheme();
  const [weatherRefreshing, setWeatherRefreshing] = useState(false);
  const [showLoadChoices, setShowLoadChoices] = useState(false);
  const [showRouteChoices, setShowRouteChoices] = useState(false);
  const flight = useQuery({ queryKey: ['planned-flight', id], queryFn: () => getPlannedFlight(db, id!), enabled: Boolean(id) });
  const route = useQuery({ queryKey: ['route-plan', flight.data?.routePlanId], queryFn: () => getRoutePlan(db, flight.data!.routePlanId!), enabled: Boolean(flight.data?.routePlanId) });
  const routeAirportKey = (route.data?.waypoints.filter((point) => point.source === 'AIRPORT').map((point) => point.ident) ?? []).join('|');
  const weatherKey = ['planned-weather', id, flight.data?.departureAirport, flight.data?.arrivalAirport, routeAirportKey];
  const weather = useQuery({ queryKey: weatherKey, enabled: Boolean(flight.data) && (!flight.data?.routePlanId || route.isSuccess), retry: false, queryFn: async () => {
    const draft = flight.data!;
    const saved = await getValidPlannedWeatherBriefing(db, draft.id);
    const briefing = saved && saved.departureAirport === draft.departureAirport && saved.arrivalAirport === draft.arrivalAirport ? saved : await capturePlannedWeatherBriefing(db, draft.id, draft.departureAirport, draft.arrivalAirport);
    client.setQueryData(['planned-weather-handoff', draft.id], briefing);
    return briefing;
  } });
  const weatherNeedsCapture = useRef(false);
  const currentRouteId = flight.data?.routePlanId;
  const availableRoutes = useQuery({ queryKey: ['route-plans'], queryFn: () => getRoutePlans(db), enabled: showRouteChoices });
  useFocusEffect(useCallback(() => {
    if (weatherNeedsCapture.current && flight.data) {
      weatherNeedsCapture.current = false;
      const draft = flight.data;
      void capturePlannedWeatherBriefing(db, draft.id, draft.departureAirport, draft.arrivalAirport).then((briefing) => { client.setQueryData(['planned-weather', id, draft.departureAirport, draft.arrivalAirport, routeAirportKey], briefing); client.setQueryData(['planned-weather-handoff', draft.id], briefing); }).catch(() => { /* Existing snapshot remains readable when offline. */ });
    }
    if (id) void client.invalidateQueries({ queryKey: ['planned-flight', id] });
    if (currentRouteId) void client.invalidateQueries({ queryKey: ['route-plan', currentRouteId] });
  }, [client, db, id, currentRouteId, flight.data, routeAirportKey]));
  const aircraft = useQuery({ queryKey: ['aircraft-profile', flight.data?.aircraftProfileId], queryFn: () => getAircraftProfile(db, flight.data!.aircraftProfileId!), enabled: Boolean(flight.data?.aircraftProfileId) });
  const load = useQuery({ queryKey: ['weight-balance-calculation', flight.data?.weightBalanceId], queryFn: () => getWeightBalanceCalculation(db, flight.data!.weightBalanceId!), enabled: Boolean(flight.data?.weightBalanceId) });
  const calculations = useQuery({ queryKey: ['weight-balance-calculations'], queryFn: () => getWeightBalanceCalculations(db), enabled: showLoadChoices });
  const summary = useMemo(() => route.data ? calculateRoute(route.data.waypoints, route.data.cruiseSpeedKt, route.data.fuelBurnPerHour, route.data.windDirectionTrue, route.data.windSpeedKt) : null, [route.data]);
  const fuel = flight.data && route.data && load.data && aircraft.data ? checkRouteFuel(route.data, load.data, aircraft.data, {
    callsign: aircraft.data.registration, date: flight.data.departureDate,
    departureAirport: flight.data.departureAirport, arrivalAirport: flight.data.arrivalAirport
  }) : null;

  const refreshWeather = async () => {
    if (!flight.data) return;
    const draft = flight.data;
    try {
      setWeatherRefreshing(true);
      const briefing = await capturePlannedWeatherBriefing(db, draft.id, draft.departureAirport, draft.arrivalAirport, true);
      client.setQueryData(['planned-weather', id, draft.departureAirport, draft.arrivalAirport, routeAirportKey], briefing);
      client.setQueryData(['planned-weather-handoff', draft.id], briefing);
      router.push({ pathname: '/flight-weather', params: { plannedFlightId: id! } });
    } catch (error) { Alert.alert('Weather unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setWeatherRefreshing(false); }
  };
  const setLoad = async (weightBalanceId: string | null) => {
    if (!id) return;
    try {
      if (weightBalanceId) await attachCalculationToPlannedFlight(db, id, weightBalanceId);
      else await updatePlannedFlight(db, id, { weightBalanceId: null, planningStatus: 'DRAFT' });
      void client.invalidateQueries({ queryKey: ['planned-flights'] });
      await client.invalidateQueries({ queryKey: ['planned-flight', id] });
      setShowLoadChoices(false);
    } catch { Alert.alert('Could not update loading', 'Try again after reopening the flight.'); }
  };
  const setRoute = async (routeId: string) => {
    if (!id) return;
    try {
      const selected = await getRoutePlan(db, routeId);
      if (!selected || selected.waypoints.length < 2 || selected.waypoints[0]?.source !== 'AIRPORT' || selected.waypoints.at(-1)?.source !== 'AIRPORT') throw new Error('Choose a route with departure and destination aerodromes.');
      const departure = selected.waypoints[0]!.ident;
      const arrival = selected.waypoints.at(-1)!.ident;
      const copyId = selected.id;
      await updatePlannedFlight(db, id, { routePlanId: copyId, planningStatus: 'DRAFT', departureAirport: departure, arrivalAirport: arrival, localArea: departure === arrival });
      client.setQueryData(['route-plan', copyId], { ...selected, id: copyId });
      await client.invalidateQueries({ queryKey: ['planned-flight', id] });
      await client.invalidateQueries({ queryKey: ['planned-flights'] });
      setShowRouteChoices(false);
    } catch (error) { Alert.alert('Could not attach route', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const remove = () => Alert.alert('Delete this planned flight?', 'This removes the flight draft. Its saved route remains in Saved routes.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete draft', style: 'destructive', onPress: () => void (async () => {
      if (!id) return;
      await deletePlannedFlight(db, id);
      await client.invalidateQueries({ queryKey: ['planned-flights'] });
      router.dismissTo('/');
    })().catch(() => Alert.alert('Could not delete draft', 'Please try again.')) }
  ]);

  if (flight.isLoading) return <Screen><StateNotice loading title="Loading flight" /></Screen>;
  if (!flight.data) return <Screen><StateNotice title="Flight not found" body="This flight draft is unavailable." actionLabel="Back to Flights" onAction={() => router.replace('/')} /></Screen>;
  const draft = flight.data;
  const routeLabel = `${draft.departureAirport} → ${draft.arrivalAirport}`;
  const airport = (ident: string) => { weatherNeedsCapture.current = true; router.push({ pathname: '/station/[icao]', params: { icao: ident } }); };
  return <>
    <Stack.Screen options={{ title: 'Flight plan', headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Delete flight draft" hitSlop={10} onPress={remove}><Ionicons name="trash-outline" size={22} color={colors.textMuted} /></Pressable> }} />
    <Screen>
      <View style={styles.heading}><Text style={[styles.eyebrow, { color: colors.primary }]}>{draft.localArea ? 'LOCAL FLIGHT' : 'FLIGHT PLAN'}</Text><Text style={[styles.title, { color: colors.text }]}>{routeLabel}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{draft.departureDate || 'Date not set'} · {draft.departureTime ? `${draft.departureTime} UTC` : 'Time not set'} · {aircraft.data?.registration ?? 'Aircraft not selected'}</Text></View>
      <Action label="Flight details · date and aircraft" icon="options-outline" disabled={Boolean(draft.logbookFlightId)} onPress={() => router.push({ pathname: '/flight-details', params: { id: draft.id } })} />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Route</Text>
        {route.isLoading ? <Text style={[styles.body, { color: colors.textMuted }]}>Loading route…</Text> : route.data ? <><FlightRouteSummary plan={route.data} /></> : <Text style={[styles.body, { color: colors.warning }]}>{route.isError ? 'Could not load the route. Retry or choose a saved route.' : 'No route is attached. Choose a saved route or build one on the map.'}</Text>}
        {draft.localArea && (summary?.distanceNm ?? 0) < 0.1 ? <Text style={[styles.note, { color: colors.warning }]}>Add local waypoints to calculate distance and fuel.</Text> : null}
        <View style={styles.actions}><Action label={route.data ? 'Edit on Map' : 'Build on Map'} icon="map-outline" disabled={Boolean(draft.logbookFlightId)} onPress={() => router.push({ pathname: '/route-planner', params: { id: route.data ? draft.routePlanId! : undefined, flightId: draft.id } })} /><Action label="Navlog / Fly" icon="navigate-outline" disabled={!route.data} onPress={() => router.push({ pathname: '/route-plan-view', params: { id: draft.routePlanId!, plannedFlightId: draft.id } })} /></View>
        <Pressable accessibilityRole="button" disabled={Boolean(draft.logbookFlightId)} onPress={() => setShowRouteChoices(!showRouteChoices)} style={styles.routeLink}><Text style={{ color: colors.primary, fontWeight: '800' }}>Choose saved route</Text><Ionicons name={showRouteChoices ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} /></Pressable>
        {route.isError ? <Pressable accessibilityRole="button" onPress={() => void route.refetch()} style={styles.routeLink}><Text style={{ color: colors.primary }}>Retry route loading</Text></Pressable> : null}
        {showRouteChoices ? <View style={[styles.choices, { backgroundColor: colors.surfaceRaised }]}>{(availableRoutes.data ?? []).filter((item) => item.waypoints.length >= 2 && item.waypoints[0]?.source === 'AIRPORT' && item.waypoints.at(-1)?.source === 'AIRPORT').slice(0, 12).map((item) => <Pressable key={item.id} onPress={() => void setRoute(item.id)} style={styles.choice}><Text style={{ color: colors.text }}>{item.title} · {item.waypoints.map((point) => point.ident).join(' → ')}</Text></Pressable>)}{!availableRoutes.isLoading && !availableRoutes.data?.length ? <Text style={{ color: colors.textMuted }}>No saved routes. Build one on the map.</Text> : null}</View> : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.section, { color: colors.text }]}>Brief flight</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>Open each source before departure. Route-wide NOTAM and airspace checks are not verified here.</Text>
        <View style={[styles.task, { borderTopColor: colors.border, gap: 10 }]}><Pressable accessibilityRole="button" accessibilityLabel="Open weather briefing" disabled={weather.isFetching || weatherRefreshing} onPress={() => { if (weather.data) router.push({ pathname: '/flight-weather', params: { plannedFlightId: id! } }); else void weather.refetch(); }} style={[styles.weatherRow, { flex: 1 }]}><Ionicons name="cloud-outline" size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.taskTitle, { color: colors.text }]}>Weather briefing</Text><Text style={[styles.note, { color: colors.textMuted }]}>{weather.isFetching || weatherRefreshing ? 'Loading…' : weather.data ? `Captured ${new Date(weather.data.generatedAt).toLocaleString()}` : 'Tap to retry'}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh weather briefing" disabled={weather.isFetching || weatherRefreshing} onPress={() => void refreshWeather()} style={{ padding: 9, opacity: weather.isFetching || weatherRefreshing ? 0.5 : 1 }}><Ionicons name="refresh-outline" size={20} color={colors.primary} /></Pressable></View>
        {weather.isError ? <Text style={[styles.note, { color: colors.warning }]}>Weather briefing unavailable. Retry when connected.</Text> : null}
        <PlannedAerodromeBriefing flightId={draft.id} ident={draft.departureAirport} label="Departure aerodrome" onOpen={() => airport(draft.departureAirport)} />
        {[...new Set(route.data?.waypoints.filter((point) => point.source === 'AIRPORT' && point.ident !== draft.departureAirport && point.ident !== draft.arrivalAirport).map((point) => point.ident) ?? [])].map((ident) => <PlannedAerodromeBriefing key={ident} flightId={draft.id} ident={ident} label="En-route aerodrome" onOpen={() => airport(ident)} />)}
        {!draft.localArea ? <PlannedAerodromeBriefing flightId={draft.id} ident={draft.arrivalAirport} label="Destination aerodrome" onOpen={() => airport(draft.arrivalAirport)} /> : null}
        <PlannedNotamBriefing flightId={draft.id} />
        <View style={[styles.task, { borderTopColor: colors.border, gap: 10 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mass and Balance" onPress={() => load.data ? router.push({ pathname: '/weight-balance-entry', params: { calculationId: load.data.id } }) : setShowLoadChoices(!showLoadChoices)} style={[styles.weatherRow, { flex: 1 }]}>
            <Ionicons name="scale-outline" size={20} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.taskTitle, { color: colors.text }]}>Mass and Balance</Text><Text style={[styles.note, { color: colors.textMuted }]}>{load.data ? `${load.data.registration} · ${load.data.calculationDate} · ${load.data.result.valid ? 'Within limits' : 'Check limits'}` : 'Start or attach a calculation'}</Text></View>
            {load.data ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Manage Mass and Balance" disabled={Boolean(draft.logbookFlightId)} accessibilityState={{ expanded: showLoadChoices }} onPress={() => setShowLoadChoices(!showLoadChoices)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={showLoadChoices ? 'close-outline' : 'ellipsis-horizontal'} size={20} color={colors.primary} /></Pressable>
        </View>
        {showLoadChoices && !draft.logbookFlightId ? <View style={[styles.choices, { backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.actions}><Action label={load.data ? 'New calculation' : 'Start calculation'} icon="scale-outline" onPress={() => router.push(aircraft.data ? { pathname: '/weight-balance-entry', params: { profileId: aircraft.data.id, plannedFlightId: draft.id, calculationDate: draft.departureDate || new Date().toISOString().slice(0, 10) } } : { pathname: '/weight-balance', params: { plannedFlightId: draft.id, calculationDate: draft.departureDate || new Date().toISOString().slice(0, 10) } })} /></View>
          <Text style={[styles.taskTitle, { color: colors.text }]}>Saved calculations{aircraft.data ? ` · ${aircraft.data.registration}` : ''}</Text>
          {(calculations.data ?? []).filter((item) => item.id !== draft.weightBalanceId && !item.logbookFlightId && (!aircraft.data || item.profileId === aircraft.data.id)).map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => void setLoad(item.id)} style={[styles.choice, { minHeight: 52, borderBottomWidth: 1, borderColor: colors.border }]}><Text style={{ color: colors.text, fontWeight: '700' }}>{item.title || item.registration}</Text><Text style={{ color: colors.textMuted }}>{item.calculationDate} · {item.result.valid ? 'Within limits' : 'Check limits'}</Text></Pressable>)}
          {calculations.isLoading ? <Text style={{ color: colors.textMuted }}>Loading…</Text> : calculations.isError ? <Pressable onPress={() => void calculations.refetch()}><Text style={{ color: colors.primary }}>Retry calculations</Text></Pressable> : !(calculations.data ?? []).some((item) => item.id !== draft.weightBalanceId && !item.logbookFlightId && (!aircraft.data || item.profileId === aircraft.data.id)) ? <Text style={{ color: colors.textMuted }}>No other calculations for this aircraft.</Text> : null}
          {draft.weightBalanceId ? <Pressable onPress={() => void setLoad(null)} style={styles.choice}><Text style={{ color: colors.danger }}>Detach current calculation</Text></Pressable> : null}
        </View> : null}
        {fuel?.status === 'shortfall' ? <View accessibilityRole="alert" style={[styles.warning, { backgroundColor: colors.surfaceRaised }]}><Ionicons name="warning-outline" size={21} color={colors.danger} /><View style={{ flex: 1 }}><Text style={[styles.warningTitle, { color: colors.danger }]}>Fuel may be too low for this route</Text><Text style={[styles.note, { color: colors.textMuted }]}>Planned {fuel.required?.toFixed(1)} {fuel.unit}; on board {fuel.onboard?.toFixed(1)} {fuel.unit}. Check usable fuel and applicable reserves.</Text></View></View> : null}
        {(draft.weightBalanceId || draft.aircraftProfileId) && fuel?.status === 'incomplete' ? <Text style={[styles.note, { color: colors.textMuted }]}>Fuel cross-check not available: {fuel.message}</Text> : null}
      </View>
      {draft.logbookStatus !== 'COMPLETE' ? <Action label={draft.planningStatus === 'READY' ? 'Reopen planning' : 'Finish planning'} icon={draft.planningStatus === 'READY' ? 'create-outline' : 'checkmark-circle-outline'} disabled={!route.data} onPress={() => void (async () => {
        if (draft.planningStatus !== 'READY' && (!draft.departureDate || (route.data?.waypoints.length ?? 0) < 2)) { Alert.alert('Complete flight details', 'Set a departure date and add at least two route points before finishing planning.'); router.push({ pathname: '/flight-details', params: { id: draft.id } }); return; }
        if (draft.planningStatus !== 'READY' && (route.data?.waypoints[0]?.source !== 'AIRPORT' || route.data?.waypoints.at(-1)?.source !== 'AIRPORT')) { Alert.alert('Check route endpoints', 'Start and end the route at an aerodrome before finishing planning.'); return; }
        await updatePlannedFlight(db, draft.id, { planningStatus: draft.planningStatus === 'READY' ? 'DRAFT' : 'READY' });
        await client.invalidateQueries({ queryKey: ['planned-flight', draft.id] });
        await client.invalidateQueries({ queryKey: ['planned-flights'] });
        if (draft.planningStatus !== 'READY') router.dismissTo('/');
      })().catch(() => Alert.alert('Could not update flight', 'Please try again.'))} /> : null}
      <Pressable accessibilityRole="button" onPress={() => draft.logbookFlightId ? router.push({ pathname: '/logbook-flight', params: { id: draft.logbookFlightId } }) : router.push({ pathname: '/logbook-entry', params: { plannedFlightId: draft.id, calculationDate: draft.departureDate || new Date().toISOString().slice(0, 10) } })} style={[styles.record, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="book-outline" size={24} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.section, { color: colors.text }]}>{draft.logbookFlightId ? 'Open flight record' : 'Record this flight'}</Text><Text style={[styles.body, { color: colors.textMuted }]}>Carry the route and flight details into the logbook</Text></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted} /></Pressable>
    </Screen>
  </>;
}

function Action({ label, icon, onPress, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.action, { backgroundColor: colors.primarySoft, opacity: disabled ? 0.5 : 1 }]}><Ionicons name={icon} size={18} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  heading: { gap: 4, marginBottom: 4 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1 }, title: { fontSize: 29, fontWeight: '900' }, meta: { fontSize: 13 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 }, section: { fontSize: 18, fontWeight: '900' }, body: { fontSize: 13, lineHeight: 20 }, note: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 4 }, action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flex: 1, minHeight: 44, borderRadius: 12 }, actionText: { fontSize: 12, fontWeight: '900' },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  routeLink: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 35 },
  task: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderTopWidth: 1, paddingTop: 10 }, taskTitle: { fontSize: 14, fontWeight: '800' }, choices: { borderRadius: 10, padding: 11, gap: 10 }, choice: { minHeight: 36, justifyContent: 'center' },
  warning: { flexDirection: 'row', gap: 10, borderRadius: 10, padding: 12 }, warningTitle: { fontSize: 14, fontWeight: '800' },
  record: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 16, gap: 13 }
});
