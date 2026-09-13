import { useForegroundGps } from '@/hooks/useForegroundGps';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StateNotice } from '@/components/StateNotice';
import { DraggableWaypoints } from '@/components/DraggableWaypoints';
import { AeronauticalMap, type AeronauticalMapRef } from '@/components/AeronauticalMap';
import { getAirport, getAirportsNearCoordinate, getMostRecentAirport, searchAirports } from '@/data/database';
import { SATELLITE_ATTRIBUTION } from '@/data/openFlightMaps';
import { getRoutePlan } from '@/data/routePlans';
import { saveRouteEdit, type RouteEditSession } from '@/data/routeEdits';
import { LatestAutosave } from '@/domain/latestAutosave';
import { useNavigation, usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { getRouteMetarWind } from '@/data/routeWeather';
import { calculateRoute, formatRouteDuration, getAiracCycleAt, type RouteWaypoint } from '@/domain/routePlanning';
import type { NearbyAirport } from '@/domain/models';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

const parsePositive = (value: string): number | null => {
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
};

const parseWindDirection = (value: string): number | null => {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 && number <= 360 ? number % 360 : null;
};

const parseWindSpeed = (value: string): number | null => {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const heading = (value: number | null): string => value === null ? '—' : `${(Math.round(value) % 360).toString().padStart(3, '0')}°`;

const waypointFromAirport = (airport: Awaited<ReturnType<typeof getAirport>> & {}): RouteWaypoint => ({
  id: `airport-${airport.id}-${Date.now()}`,
  ident: airport.weatherCode || airport.ident,
  name: airport.name,
  latitude: airport.latitude,
  longitude: airport.longitude,
  source: 'AIRPORT'
});

export default function RoutePlannerScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ id?: string; flightId?: string }>();
  return <RouteEditor key={`${params.id ?? ''}:${params.flightId ?? ''}`} {...params} />;
}

function RouteEditor({ id, flightId }: { id?: string; flightId?: string }): React.JSX.Element {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const gps = useForegroundGps();
  const { preferences, updatePreferences } = usePreferences();
  const cameraRef = useRef<AeronauticalMapRef>(null);
  const hydratedPlanId = useRef<string | null>(null);
  const currentCycle = getAiracCycleAt();
  const [hydrated, setHydrated] = useState(!id);
  const [planId, setPlanId] = useState(id ?? '');
  const [title, setTitle] = useState('');
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>([]);
  const [cruiseSpeed, setCruiseSpeed] = useState('');
  const [fuelBurn, setFuelBurn] = useState('');
  const [fuelUnit, setFuelUnit] = useState<'L' | 'US_GAL'>('L');
  const [windDirection, setWindDirection] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [windSource, setWindSource] = useState<'METAR' | 'MANUAL' | null>(null);
  const [windStation, setWindStation] = useState<string | null>(null);
  const [windStationDistanceKm, setWindStationDistanceKm] = useState<number | null>(null);
  const [windObservedAt, setWindObservedAt] = useState<number | null>(null);
  const [allLegAltitude, setAllLegAltitude] = useState('');
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [nearbyChoice, setNearbyChoice] = useState<{ longitude: number; latitude: number; airports: NearbyAirport[]; loading: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [aeroVisible, setAeroVisible] = useState(true);
  const [baseLayer, setBaseLayer] = useState<'chart' | 'satellite'>('chart');
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sheetTop, setSheetTop] = useState(0.63);
  const [draggingWaypoint, setDraggingWaypoint] = useState(false);
  const layoutHeight = useRef(1);
  const sheetPosition = useRef(0.63);
  const dragStart = useRef(0.63);
  useEffect(() => { sheetPosition.current = sheetTop; }, [sheetTop]);
  const setEditorExpanded = (expanded: boolean) => setSheetTop(expanded ? 0.18 : 0.63);
  const [sheetPan, setPan] = useState<ReturnType<typeof PanResponder.create> | null>(null);
  useEffect(() => {
    // Install the gesture responder once, with callbacks reading current state from refs.
    setPan(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragStart.current = sheetPosition.current; },
    onPanResponderMove: (_, gesture) => setSheetTop(Math.max(0.1, Math.min(0.88, dragStart.current + gesture.dy / layoutHeight.current))),
    onPanResponderRelease: (_, gesture) => {
      const top = Math.max(0.1, Math.min(0.88, dragStart.current + gesture.dy / layoutHeight.current));
      if (top > 0.84) { setEditorOpen(false); setSheetTop(0.63); }
      else setSheetTop(top);
    }
  }));
  }, []);
  const [mapReady, setMapReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [copied, setCopied] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const fitted = useRef(false);
  const windRequest = useRef(0);
  const departureRef = useRef<string | undefined>(undefined);
  useEffect(() => { departureRef.current = waypoints[0]?.id; }, [waypoints]);
  const editSession = useRef<RouteEditSession>({ flightId });
  const workingId = useRef(id ?? '');
  const plan = useQuery({ queryKey: ['route-plan', id], queryFn: () => getRoutePlan(db, id!), enabled: Boolean(id) });
  const startAirport = useQuery({
    queryKey: ['route-map-start', preferences.mapStartAirport],
    queryFn: async () => {
      if (preferences.mapStartAirport) {
        const preferred = await getAirport(db, preferences.mapStartAirport);
        if (preferred) return preferred;
      }
      return getMostRecentAirport(db);
    }
  });
  const airports = useQuery({
    queryKey: ['route-airport-search', debouncedQuery],
    queryFn: () => searchAirports(db, debouncedQuery, 8),
    enabled: debouncedQuery.trim().length >= 2
  });

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!id || !plan.data || hydratedPlanId.current === id) return;
    hydratedPlanId.current = id;
    editSession.current.revision = plan.data.updatedAt;
    setHydrated(true);
    setPlanId(plan.data.id);
    setTitle(plan.data.title);
    setWaypoints(plan.data.waypoints);
    setCruiseSpeed(plan.data.cruiseSpeedKt ? String(plan.data.cruiseSpeedKt) : '');
    setFuelBurn(plan.data.fuelBurnPerHour ? String(plan.data.fuelBurnPerHour) : '');
    setFuelUnit(plan.data.fuelUnit);
    setWindDirection(plan.data.windDirectionTrue === null ? '' : String(plan.data.windDirectionTrue));
    setWindSpeed(plan.data.windSpeedKt === null ? '' : String(plan.data.windSpeedKt));
    setWindSource(plan.data.windSource);
    setWindStation(plan.data.windStation);
    setWindStationDistanceKm(plan.data.windStationDistanceKm);
    setWindObservedAt(plan.data.windObservedAt);
    const legAltitudes = plan.data.waypoints.slice(1).map((point) => point.plannedAltitudeFt ?? null);
    setAllLegAltitude(legAltitudes.length > 0 && legAltitudes.every((altitude) => altitude !== null && altitude === legAltitudes[0]) ? String(legAltitudes[0]) : '');
  }, [id, plan.data]);

  const summary = useMemo(
    () => calculateRoute(waypoints, parsePositive(cruiseSpeed), parsePositive(fuelBurn), parseWindDirection(windDirection), parseWindSpeed(windSpeed)),
    [waypoints, cruiseSpeed, fuelBurn, windDirection, windSpeed]
  );
  const initialCenter = useMemo(() => startAirport.data ? ({ latitude: startAirport.data.latitude, longitude: startAirport.data.longitude }) : undefined, [startAirport.data]);

  useEffect(() => {
    if (!mapReady || !waypoints.length || fitted.current) return;
    fitted.current = true;
    const timeout = setTimeout(() => waypoints.length === 1
      ? cameraRef.current?.flyTo(waypoints[0]!.longitude, waypoints[0]!.latitude, 11)
      : cameraRef.current?.fitRoute(), 120);
    return () => clearTimeout(timeout);
  }, [mapReady, planId, waypoints]);

  const suggestedTitle = waypoints.length >= 2 ? `${waypoints[0]!.ident} to ${waypoints[waypoints.length - 1]!.ident}` : 'Untitled route';

  const applyMetarWind = async (departure: RouteWaypoint, force: boolean, showError = true) => {
    const request = ++windRequest.current;
    try {
      setWeatherBusy(true);
      const result = await getRouteMetarWind(db, departure, force);
      if (request !== windRequest.current || (departureRef.current && departureRef.current !== departure.id)) return;
      if (!result) throw new Error(`No METAR was found within 120 km of ${departure.ident}.`);
      const { report, station, distanceKm } = result;
      const speed = report.windSpeedKt;
      if (speed === null) throw new Error(`${station} has no usable wind speed.`);
      const direction = report.windDirectionTrue ?? (speed === 0 ? 0 : null);
      if (direction === null) throw new Error(`${station} is reporting variable wind, so a single correction angle cannot be calculated.`);
      setWindDirection(String(direction));
      setWindSpeed(String(speed));
      setWindSource('METAR');
      setWindStation(station);
      setWindStationDistanceKm(distanceKm);
      setWindObservedAt(report.observedAt);
    } catch (error) {
      if (showError) Alert.alert('Could not use METAR wind', error instanceof Error ? error.message : 'Weather data could not be refreshed.');
    } finally {
      if (request === windRequest.current) setWeatherBusy(false);
    }
  };

  const lastWindDeparture = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!hydrated || !waypoints[0] || lastWindDeparture.current === waypoints[0].id) return;
    const wasSet = lastWindDeparture.current !== undefined;
    lastWindDeparture.current = waypoints[0].id;
    if ((!wasSet && windSource === null && windSpeed === '') || (wasSet && windSource === 'METAR')) {
      setWindDirection(''); setWindSpeed(''); setWindSource(null); setWindStation(null); setWindStationDistanceKm(null); setWindObservedAt(null);
      void applyMetarWind(waypoints[0], false, false);
    }
    // Only a changed departure should trigger a station lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, waypoints[0]?.id]);

  const refreshRouteWeather = async () => {
    const first = waypoints[0];
    if (!first) {
      Alert.alert('Add a departure first', 'The route needs a departure airport before its METAR wind can be used.');
      return;
    }
    await applyMetarWind(first, true);
  };

  const addAirport = (airport: NonNullable<Awaited<ReturnType<typeof getAirport>>>) => {
    const point = waypointFromAirport(airport);
    setWaypoints((current) => [...current, point]);
    setQuery('');
    setDebouncedQuery('');
    setEditorExpanded(false);
  };

  const addMapPoint = (longitude: number, latitude: number) => {
    const point: RouteWaypoint = {
      id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ident: `WP${waypoints.filter((candidate) => candidate.source === 'MAP').length + 1}`,
      name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      latitude,
      longitude,
      source: 'MAP'
    };
    setWaypoints((current) => [...current, point]);
    setNearbyChoice(null);
  };

  const inspectMapPoint = async (longitude: number, latitude: number) => {
    setLayerMenuOpen(false);
    setNearbyChoice({ longitude, latitude, airports: [], loading: true });
    try {
      const nearby = await getAirportsNearCoordinate(db, latitude, longitude, { radiusKm: 12, limit: 6 });
      setNearbyChoice({ longitude, latitude, airports: nearby, loading: false });
    } catch {
      setNearbyChoice({ longitude, latitude, airports: [], loading: false });
    }
  };

  const updateLegAltitude = (destinationIndex: number, value: string) => {
    const altitude = parsePositive(value);
    setWaypoints((current) => current.map((point, index) => index === destinationIndex
      ? { ...point, plannedAltitudeFt: altitude }
      : point));
  };

  const applyAltitudeToAllLegs = () => {
    const altitude = parsePositive(allLegAltitude);
    if (allLegAltitude.trim() && altitude === null) {
      Alert.alert('Check planned altitude', 'Enter an altitude greater than zero, or leave it blank to clear all leg altitudes.');
      return;
    }
    setWaypoints((current) => current.map((point, index) => index === 0 ? point : { ...point, plannedAltitudeFt: altitude }));
  };

  const updateLegNote = (destinationIndex: number, value: string) => {
    setWaypoints((current) => current.map((point, index) => index === destinationIndex
      ? { ...point, legNote: value }
      : point));
  };

  const fitRoute = () => {
    if (!waypoints.length) return;
    if (waypoints.length === 1) cameraRef.current?.flyTo(waypoints[0]!.longitude, waypoints[0]!.latitude, 11);
    else cameraRef.current?.fitRoute();
  };

  const centerOnStart = () => {
    if (!startAirport.data) {
      Alert.alert('No start airport set', 'Choose a map start airport in Preferences. Foreground GPS requires a location-enabled native build.');
      return;
    }
    cameraRef.current?.flyTo(startAirport.data.longitude, startAirport.data.latitude, 11);
  };

  const candidate = useMemo(() => ({
    id: planId, title: title.trim() || suggestedTitle, waypoints,
    cruiseSpeedKt: parsePositive(cruiseSpeed), fuelBurnPerHour: parsePositive(fuelBurn), fuelUnit,
    windDirectionTrue: parseWindDirection(windDirection), windSpeedKt: parseWindSpeed(windSpeed),
    windSource, windStation, windStationDistanceKm, windObservedAt,
    airacCycle: plan.data?.airacCycle || currentCycle
  }), [planId, title, suggestedTitle, waypoints, cruiseSpeed, fuelBurn, fuelUnit, windDirection, windSpeed, windSource, windStation, windStationDistanceKm, windObservedAt, plan.data?.airacCycle, currentCycle]);
  const persist = useCallback(async (input: typeof candidate) => {
    const saved = await saveRouteEdit(db, { ...input, id: workingId.current }, editSession.current);
    workingId.current = saved.id;
    editSession.current = { flightId, ownedId: saved.changed ? saved.id : editSession.current.ownedId, revision: saved.revision };
    const persisted = await getRoutePlan(db, saved.id);
    setPlanId(saved.id);
    if (saved.copied) setCopied(true);
    queryClient.setQueryData(['route-plan', saved.id], persisted);
    await queryClient.invalidateQueries({ queryKey: ['route-plan-view'] });
    await queryClient.invalidateQueries({ queryKey: ['route-plans'] });
    if (flightId) {
      await queryClient.invalidateQueries({ queryKey: ['planned-flight', flightId] });
      await queryClient.invalidateQueries({ queryKey: ['planned-flights'] });
    }
    if (!flightId && preferences.lastMapRouteId !== saved.id) void updatePreferences({ lastMapRouteId: saved.id }).catch(() => undefined);
  }, [db, flightId, preferences.lastMapRouteId, queryClient, updatePreferences]);
  const [autosave] = useState(() => new LatestAutosave<typeof candidate>(async () => undefined, setSaveStatus));
  useEffect(() => { autosave.setWriter(persist); }, [autosave, persist]);
  const invalidInputs = Boolean((cruiseSpeed.trim() && parsePositive(cruiseSpeed) === null) || (fuelBurn.trim() && parsePositive(fuelBurn) === null) || (windDirection.trim() && parseWindDirection(windDirection) === null) || (windSpeed.trim() && parseWindSpeed(windSpeed) === null));
  const signature = JSON.stringify({ ...candidate, id: '' });
  useEffect(() => {
    if (!hydrated || invalidInputs || (id && hydratedPlanId.current !== id)) return;
    if (!waypoints.length && !workingId.current) return;
    autosave.enqueue(candidate);
    // Storage identity is assigned by the serialized writer; it is not a user edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, autosave, id, hydrated, invalidInputs]);
  const navigation = useNavigation();
  const [leaveAction, setLeaveAction] = useState<NavigationAction | null>(null);
  usePreventRemove(invalidInputs || saveStatus !== 'saved', ({ data }) => {
    if (invalidInputs) { setEditorOpen(true); setPerformanceOpen(true); Alert.alert('Check route inputs', 'Enter positive TAS and fuel burn, wind direction from 0 to 360 degrees, and non-negative wind speed. Clear any field to leave it unset.'); return; }
    setLeaveAction(data.action);
    void autosave.flush().catch((error) => {
      setLeaveAction(null);
      Alert.alert('Route not saved', error instanceof Error ? error.message : 'Please retry before leaving.');
    });
  });
  useEffect(() => {
    if (saveStatus === 'saved' && leaveAction) {
      // Resume the navigation action after its asynchronous local write.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeaveAction(null); navigation.dispatch(leaveAction); }
  }, [saveStatus, leaveAction, navigation]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') void autosave.flush().catch(() => undefined); });
    return () => { listener.remove(); void autosave.flush().catch(() => undefined); windRequest.current += 1; };
  }, [autosave]);
  const finishEditing = () => {
    if (flightId) router.replace({ pathname: '/flight-plan', params: { id: flightId } });
    else if (workingId.current) router.replace({ pathname: '/route-plan-view', params: { id: workingId.current } });
  };

  const showSource = () => Alert.alert(
    'Map and navigation data',
    `Chart and aeronautical overlay: © open flightmaps association · © OpenStreetMap contributors (AIRAC ${currentCycle}, detail through zoom 13). Satellite: ${SATELLITE_ATTRIBUTION}. The OFM overlay can remain visible on Satellite through zoom 13; switch it off for closer imagery.\n\nCheck the official AIP, NOTAMs, and current airspace data before flight. Magnetic variation uses WMM2025. Wind calculations assume constant entered wind for every leg. The map is a planning aid and does not validate terrain, obstacles, or weather.`
  );

  const onMapReady = useCallback(() => setMapReady(true), []);

  if (id && !hydrated) return <View style={[styles.screen, { backgroundColor: colors.background, padding: 16 }]}><StateNotice loading={plan.isLoading} title={plan.isLoading ? 'Loading route' : 'Route unavailable'} body={plan.isLoading ? undefined : 'The saved route could not be opened.'} actionLabel={plan.isLoading ? undefined : 'Open a new map'} onAction={() => router.replace(flightId ? { pathname: '/route-planner', params: { flightId } } : '/route-planner')} /></View>;

  return <>
    <Stack.Screen options={{
      title: 'Map and Route',
      headerRight: () => <View style={styles.headerActions}>
        {flightId ? <Pressable accessibilityRole="button" accessibilityLabel="Open flight plan" hitSlop={9} onPress={finishEditing}><Ionicons name="arrow-forward-circle-outline" size={24} color={colors.primary} /></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Saved routes" hitSlop={9} onPress={() => router.replace('/route-plans')}><Ionicons name="folder-open-outline" size={23} color={colors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Map source information" hitSlop={9} onPress={showSource}><Ionicons name="information-circle-outline" size={24} color={colors.text} /></Pressable>
      </View>
    }} />
    <View onLayout={(event) => { layoutHeight.current = event.nativeEvent.layout.height; }} style={[styles.screen, { backgroundColor: colors.background }]}>
      <AeronauticalMap currentPosition={gps.position} ref={cameraRef} waypoints={waypoints} cycle={currentCycle} aeronauticalLayerVisible={aeroVisible} baseLayer={baseLayer} initialCenter={initialCenter} onReady={onMapReady} onMapPress={() => setLayerMenuOpen(false)} onLongPress={(longitude, latitude) => void inspectMapPoint(longitude, latitude)} />

      <View style={styles.mapControls}>
        {gps.available ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle device GPS" onPress={() => void gps.toggle()} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="navigate" size={21} color={gps.enabled ? colors.success : colors.textMuted} /></Pressable>
        <Text style={{ backgroundColor: colors.surface, color: colors.text, padding: 4, maxWidth: 160, fontSize: 11 }}>{gps.status}</Text>
        {gps.position ? <Pressable accessibilityRole="button" accessibilityLabel="Center on GPS position" onPress={() => cameraRef.current?.flyTo(gps.position!.longitude, gps.position!.latitude, 13)} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="locate" size={21} color={colors.primary} /></Pressable> : null}
        </> : null}
        {layerMenuOpen ? <View style={[styles.layerMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LayerOption label="Chart" icon="map-outline" selected={baseLayer === 'chart'} onPress={() => setBaseLayer('chart')} />
          <LayerOption label="Satellite" icon="earth-outline" selected={baseLayer === 'satellite'} onPress={() => setBaseLayer('satellite')} />
          <LayerOption label="Aeronautical overlay" icon="layers-outline" selected={aeroVisible} onPress={() => setAeroVisible((current) => !current)} />
        </View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Choose map layers" onPress={() => setLayerMenuOpen((current) => !current)} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="layers" size={21} color={colors.primary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reload chart tiles" onPress={() => cameraRef.current?.refreshTiles()} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="refresh-outline" size={21} color={colors.primary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Center on map start airport" onPress={centerOnStart} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="locate-outline" size={21} color={colors.primary} /></Pressable>
        {waypoints.length ? <Pressable accessibilityRole="button" accessibilityLabel="Fit route on map" onPress={fitRoute} style={[styles.mapButton, { backgroundColor: colors.surface }]}><Ionicons name="scan-outline" size={20} color={colors.primary} /></Pressable> : null}
      </View>

      {!waypoints.length ? <View pointerEvents="none" style={[styles.longPressHint, { backgroundColor: colors.surface }]}><Text style={[styles.longPressText, { color: colors.textMuted }]}>Search or long-press to add a waypoint</Text></View> : null}

      {!editorOpen ? <Pressable accessibilityRole="button" accessibilityLabel="Open route editor" onPress={() => { setEditorExpanded(false); setEditorOpen(true); }} style={[styles.routeStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.routeStripCopy}><Text numberOfLines={1} style={[styles.routeStripTitle, { color: colors.text }]}>{title.trim() || suggestedTitle}</Text><Text style={[styles.routeStripMeta, { color: colors.textMuted }]}>{waypoints.length < 2 ? 'Tap to build a route' : `${summary.distanceNm.toFixed(1)} NM · ${formatRouteDuration(summary.estimatedMinutes)} EET${summary.legs.some((leg) => !leg.windSolutionPossible) ? ' · Check wind' : ''}`}</Text></View><View style={[styles.editPill, { backgroundColor: colors.primarySoft }]}><Ionicons name="options-outline" size={18} color={colors.primary} /><Text style={[styles.editPillText, { color: colors.primary }]}>Plan</Text></View></Pressable> : null}

      {editorOpen ? <KeyboardAvoidingView style={[styles.sheetWrap, { top: `${sheetTop * 100}%` }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none"><View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View {...sheetPan?.panHandlers} accessible accessibilityLabel="Resize route editor" accessibilityHint="Drag up for route details or down for more map" accessibilityRole="adjustable" accessibilityActions={[{ name: 'increment', label: 'Expand editor' }, { name: 'decrement', label: 'Show more map' }]} onAccessibilityAction={(event) => setSheetTop(event.nativeEvent.actionName === 'increment' ? 0.18 : 0.73)} style={styles.sheetHeader}><View style={[styles.handle, { backgroundColor: colors.border }]} /><View style={styles.sheetTitleRow}><View style={{ flex: 1 }}><Text style={[styles.sectionTitle, { color: colors.text }]}>{planId ? 'Edit route' : 'New route'}</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Drag this panel to resize · drag handles to reorder points</Text></View></View></View>
        <ScrollView scrollEnabled={!draggingWaypoint} contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}><TextInput accessibilityLabel="Route title" value={title} onChangeText={setTitle} placeholder={suggestedTitle} placeholderTextColor={colors.textMuted} style={[styles.input, styles.titleInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]} /></View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="search" size={19} color={colors.textMuted} /><TextInput autoCapitalize="characters" autoCorrect={false} value={query} onChangeText={(value) => { setQuery(value); if (value.trim().length >= 2) setEditorExpanded(true); }} placeholder="Add airport by ICAO, name, or city" placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} />{query ? <Pressable hitSlop={8} onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.textMuted} /></Pressable> : null}</View>
          {debouncedQuery.trim().length >= 2 ? <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>{(airports.data ?? []).slice(0, 5).map((airport) => <Pressable key={airport.id} onPress={() => addAirport(airport)} style={({ pressed }) => [styles.resultRow, { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><View style={styles.resultCopy}><Text style={[styles.resultIdent, { color: colors.text }]}>{airport.weatherCode || airport.ident}</Text><Text numberOfLines={1} style={[styles.resultName, { color: colors.textMuted }]}>{airport.name} · {airport.municipality || airport.countryCode}</Text></View><Ionicons name="add" size={20} color={colors.primary} /></Pressable>)}{!airports.isLoading && !(airports.data?.length) ? <Text style={[styles.emptySearch, { color: colors.textMuted }]}>No matching airports</Text> : null}</View> : null}
          <View style={styles.summaryRow}><SummaryItem label="Distance" value={`${summary.distanceNm.toFixed(1)} NM`} /><SummaryItem label="EET" value={formatRouteDuration(summary.estimatedMinutes)} /><SummaryItem label="Fuel" value={summary.estimatedFuel === null ? '—' : `${summary.estimatedFuel.toFixed(1)} ${fuelUnit === 'US_GAL' ? 'US gal' : 'L'}`} /></View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: performanceOpen }} onPress={() => setPerformanceOpen(!performanceOpen)}><Text style={[styles.subheading, { color: colors.primary }]}>Performance and wind {performanceOpen ? '▴' : '▾'}</Text></Pressable>
          {invalidInputs ? <Text style={[styles.helper, { color: colors.warning }]}>Complete or clear the invalid performance/wind field before leaving.</Text> : null}
          {parsePositive(cruiseSpeed) === null ? <Text style={[styles.helper, { color: colors.textMuted }]}>Set TAS in Performance and wind to calculate WCA, headings and time.</Text> : null}
          {performanceOpen ? <>
          <View style={styles.assumptionsRow}><AssumptionInput label="TAS" value={cruiseSpeed} onChange={setCruiseSpeed} unit="KT" /><AssumptionInput label="Fuel burn" value={fuelBurn} onChange={setFuelBurn} unit={fuelUnit === 'US_GAL' ? 'US GAL/H' : 'L/H'} onUnitPress={() => setFuelUnit((current) => current === 'L' ? 'US_GAL' : 'L')} /></View>
          <View style={styles.assumptionsRow}><AssumptionInput label="Wind from" value={windDirection} onChange={(value) => { setWindDirection(value); setWindSource('MANUAL'); setWindStation(null); setWindStationDistanceKm(null); setWindObservedAt(null); }} unit="°T" /><AssumptionInput label="Wind speed" value={windSpeed} onChange={(value) => { setWindSpeed(value); setWindSource('MANUAL'); setWindStation(null); setWindStationDistanceKm(null); setWindObservedAt(null); }} unit="KT" /></View>
          <View style={styles.windStatus}><Text style={[styles.windHelper, { color: colors.textMuted }]}>{windSource === 'METAR' && windStation ? `${windStation} METAR${windStationDistanceKm !== null && windStationDistanceKm >= 0.5 ? ` · ${Math.round(windStationDistanceKm)} km from ${waypoints[0]?.ident ?? 'departure'}` : ''} · ${windObservedAt ? new Date(windObservedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : 'time unavailable'} UTC` : 'The departure or nearest reporting-station METAR surface wind is applied to every leg.'}</Text><Pressable disabled={weatherBusy || !waypoints.length} accessibilityRole="button" accessibilityLabel="Refresh route wind from departure METAR" onPress={() => void refreshRouteWeather()} style={[styles.refreshWind, { backgroundColor: colors.primarySoft, opacity: weatherBusy || !waypoints.length ? 0.45 : 1 }]}><Ionicons name="refresh" size={16} color={colors.primary} /><Text style={[styles.refreshWindText, { color: colors.primary }]}>{weatherBusy ? 'Refreshing…' : 'Refresh METAR'}</Text></Pressable></View>
          </> : null}
          <Text accessibilityLiveRegion="polite" style={[styles.helper, { color: saveStatus === 'error' ? colors.danger : colors.textMuted }]}>{saveStatus === 'saving' ? 'Saving locally…' : saveStatus === 'error' ? 'Could not save route' : 'Saved locally'}{copied ? ' · Editing a separate copy' : ''}</Text>
          {saveStatus === 'error' ? <Pressable onPress={() => void autosave.flush().catch((error) => Alert.alert('Route not saved', String(error)))}><Text style={{ color: colors.primary }}>Retry autosave</Text></Pressable> : null}
          {saveStatus === 'error' ? <Pressable onPress={() => Alert.alert('Discard unsaved changes?', 'The last stored route will remain available.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard changes', style: 'destructive', onPress: () => { autosave.discard(); router.replace(flightId ? { pathname: '/flight-plan', params: { id: flightId } } : '/route-plans'); } }])}><Text style={{ color: colors.textMuted }}>Discard unsaved changes</Text></Pressable> : null}
          {planId ? <Pressable onPress={finishEditing}><Text style={{ color: colors.primary }}>{flightId ? 'Brief flight' : 'Open navlog'}</Text></Pressable> : null}
          <Text style={[styles.subheading, { color: colors.text }]}>Route points</Text>
          {!waypoints.length ? <View style={[styles.emptyRoute, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="navigate-outline" size={24} color={colors.primary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Start with an airport</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Search above or long-press anywhere on the map.</Text></View> : <DraggableWaypoints waypoints={waypoints} onChange={setWaypoints} onDragging={setDraggingWaypoint} />}
          {summary.legs.length ? <><Text style={[styles.subheading, { color: colors.text }]}>Leg navigation</Text><View style={styles.applyAllRow}><AssumptionInput label="All leg altitudes" value={allLegAltitude} onChange={setAllLegAltitude} unit="FT" /><Pressable accessibilityRole="button" accessibilityLabel="Apply altitude to every leg" onPress={applyAltitudeToAllLegs} style={[styles.applyAllButton, { backgroundColor: colors.primarySoft }]}><Ionicons name="copy-outline" size={16} color={colors.primary} /><Text style={[styles.applyAllText, { color: colors.primary }]}>Apply all</Text></Pressable></View>{summary.legs.map((leg, legIndex) => <View key={`${leg.from.id}-${leg.to.id}`} style={[styles.legCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.legHeader}><Text style={[styles.legRoute, { color: colors.text }]}>{leg.from.ident} → {leg.to.ident}</Text><Text style={[styles.legDistance, { color: colors.textMuted }]}>{leg.distanceNm.toFixed(1)} NM · {formatRouteDuration(leg.estimatedMinutes)}</Text></View><AssumptionInput label="Planned altitude" value={leg.plannedAltitudeFt === null ? '' : String(leg.plannedAltitudeFt)} onChange={(value) => updateLegAltitude(legIndex + 1, value)} unit="FT" /><View><Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Leg note (optional)</Text><TextInput accessibilityLabel={`Note for ${leg.from.ident} to ${leg.to.ident}`} value={waypoints[legIndex + 1]?.legNote ?? ''} onChangeText={(value) => updateLegNote(legIndex + 1, value)} multiline maxLength={240} placeholder="Landmark, reporting point, frequency…" placeholderTextColor={colors.textMuted} style={[styles.noteInput, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, color: colors.text }]} /></View>{leg.windSolutionPossible ? <><View style={styles.legValues}><NavValue label="Track true" value={`${heading(leg.trueTrack)}T`} /><NavValue label="Track magnetic" value={`${heading(leg.magneticTrack)}M`} /><NavValue label="WCA" value={leg.windCorrectionAngle === null ? '—' : `${leg.windCorrectionAngle >= 0 ? '+' : ''}${Math.round(leg.windCorrectionAngle)}°`} /></View><View style={styles.legValues}><NavValue label="Heading magnetic" value={`${heading(leg.magneticHeading)}M`} /><NavValue label="Groundspeed" value={leg.groundSpeedKt === null ? '—' : `${Math.round(leg.groundSpeedKt)} kt`} /><NavValue label="Variation" value={leg.magneticVariation === null ? '—' : `${Math.abs(leg.magneticVariation).toFixed(1)}°${leg.magneticVariation >= 0 ? 'E' : 'W'}`} /></View></> : <Text style={[styles.noSolution, { color: colors.danger }]}>No wind solution for this track and TAS.</Text>}</View>)}</> : null}
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Planning aid only. Check the current chart, terrain, weather, NOTAMs, aircraft performance, fuel policy, magnetic data, and official sources before flight.</Text>
        </ScrollView>
      </View></KeyboardAvoidingView> : null}
      <Modal visible={Boolean(nearbyChoice)} transparent animationType="fade" onRequestClose={() => setNearbyChoice(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNearbyChoice(null)}><Pressable style={[styles.nearbySheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(event) => event.stopPropagation()}>
          <View style={styles.nearbyHeader}><View style={{ flex: 1 }}><Text style={[styles.nearbyTitle, { color: colors.text }]}>Add waypoint</Text><Text style={[styles.helper, { color: colors.textMuted }]}>Choose a nearby aerodrome or use the exact chart position.</Text></View><Pressable hitSlop={9} onPress={() => setNearbyChoice(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable></View>
          {nearbyChoice?.loading ? <Text style={[styles.nearbyLoading, { color: colors.textMuted }]}>Looking for nearby aerodromes…</Text> : nearbyChoice?.airports.map(({ airport, distanceKm }) => <Pressable key={airport.id} onPress={() => { addAirport(airport); setNearbyChoice(null); }} style={[styles.nearbyRow, { borderTopColor: colors.border }]}><View style={[styles.nearbyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="airplane-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.resultIdent, { color: colors.text }]}>{airport.weatherCode || airport.ident}</Text><Text numberOfLines={1} style={[styles.resultName, { color: colors.textMuted }]}>{airport.name} · {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</Text></View><Ionicons name="add" size={19} color={colors.primary} /></Pressable>)}
          {nearbyChoice ? <Pressable onPress={() => addMapPoint(nearbyChoice.longitude, nearbyChoice.latitude)} style={[styles.nearbyRow, { borderTopColor: colors.border }]}><View style={[styles.nearbyIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="location-outline" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.resultIdent, { color: colors.text }]}>Exact coordinates</Text><Text style={[styles.resultName, { color: colors.textMuted }]}>{nearbyChoice.latitude.toFixed(5)}, {nearbyChoice.longitude.toFixed(5)}</Text></View><Ionicons name="add" size={19} color={colors.primary} /></Pressable> : null}
          <Text style={[styles.nearbyNote, { color: colors.textMuted }]}>OpenFlightMaps is a raster chart. Navaids and reporting points require a structured data source before AeroBrief can identify them reliably.</Text>
        </Pressable></Pressable>
      </Modal>
    </View>
  </>;
}

function LayerOption({ label, icon, selected, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; selected: boolean; onPress: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.layerOption}><Ionicons name={selected ? 'checkmark-circle' : icon} size={18} color={selected ? colors.primary : colors.textMuted} /><Text style={[styles.layerLabel, { color: colors.text }]}>{label}</Text></Pressable>;
}

function SummaryItem({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={[styles.summaryItem, { backgroundColor: colors.primarySoft }]}><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text></View>;
}

function AssumptionInput({ label, value, onChange, unit, onUnitPress }: { label: string; value: string; onChange: (value: string) => void; unit: string; onUnitPress?: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={styles.assumption}><Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text><View style={[styles.unitInput, { backgroundColor: colors.surface, borderColor: colors.border }]}><TextInput keyboardType="decimal-pad" value={value} onChangeText={onChange} placeholder="—" placeholderTextColor={colors.textMuted} style={[styles.unitTextInput, { color: colors.text }]} />{onUnitPress ? <Pressable onPress={onUnitPress}><Text style={[styles.unit, { color: colors.primary }]}>{unit}</Text></Pressable> : <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>}</View></View>;
}

function NavValue({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={styles.navValue}><Text style={[styles.navLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.navNumber, { color: colors.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' }, headerActions: { flexDirection: 'row', gap: 16 },
  mapControls: { position: 'absolute', top: 12, right: 12, alignItems: 'flex-end', gap: 9 }, mapButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  layerMenu: { minWidth: 190, borderWidth: 1, borderRadius: 16, paddingVertical: 5, elevation: 6 }, layerOption: { minHeight: 44, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, layerLabel: { fontSize: 13, fontWeight: '800' },
  longPressHint: { position: 'absolute', left: 12, bottom: 103, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, elevation: 3 }, longPressText: { fontSize: 10, fontWeight: '800' },
  routeStrip: { position: 'absolute', left: 12, right: 12, bottom: 12, minHeight: 78, borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 6 }, routeStripCopy: { flex: 1 }, routeStripTitle: { fontSize: 17, fontWeight: '900' }, routeStripMeta: { fontSize: 11, marginTop: 4, fontWeight: '700' }, editPill: { minHeight: 42, paddingHorizontal: 13, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }, editPillText: { fontSize: 12, fontWeight: '900' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 }, sheet: { flex: 1, borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: 'hidden', elevation: 12 }, sheetHeader: { minHeight: 72, paddingHorizontal: 17, paddingBottom: 9 }, handle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 5 }, sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, sheetAction: { alignItems: 'center', justifyContent: 'center', minWidth: 49, minHeight: 42 }, sectionTitle: { fontSize: 19, fontWeight: '900' }, helper: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  editorContent: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, titleInput: { flex: 1 }, saveButton: { minHeight: 49, borderRadius: 14, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' }, saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, input: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15, fontWeight: '700' },
  searchBox: { minHeight: 49, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, searchInput: { flex: 1, height: 47, fontSize: 14 }, results: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' }, resultRow: { minHeight: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, resultCopy: { flex: 1 }, resultIdent: { fontSize: 14, fontWeight: '900' }, resultName: { fontSize: 11, marginTop: 2 }, emptySearch: { padding: 14, fontSize: 12 },
  summaryRow: { flexDirection: 'row', gap: 8 }, summaryItem: { flex: 1, minHeight: 64, borderRadius: 14, padding: 10, justifyContent: 'center' }, summaryLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 }, summaryValue: { fontSize: 16, fontWeight: '900', marginTop: 4 }, subheading: { fontSize: 16, fontWeight: '900', marginTop: 4 }, assumptionsRow: { flexDirection: 'row', gap: 10 }, assumption: { flex: 1 }, fieldLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }, unitInput: { height: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' }, unitTextInput: { flex: 1, height: 46, fontSize: 15, fontWeight: '800' }, unit: { fontSize: 9, fontWeight: '900' }, windStatus: { gap: 8 }, windHelper: { fontSize: 10, lineHeight: 15 }, refreshWind: { minHeight: 38, alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 }, refreshWindText: { fontSize: 11, fontWeight: '900' },
  emptyRoute: { borderWidth: 1, borderRadius: 16, alignItems: 'center', padding: 18 }, emptyTitle: { fontSize: 14, fontWeight: '900', marginTop: 6 }, waypointRow: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, waypointNumber: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, waypointNumberText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, waypointCopy: { flex: 1 }, waypointIdent: { fontSize: 14, fontWeight: '900' }, waypointName: { fontSize: 10, marginTop: 2 }, waypointActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legCard: { borderWidth: 1, borderRadius: 15, padding: 12, gap: 10 }, legHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, legRoute: { flex: 1, fontSize: 14, fontWeight: '900' }, legDistance: { fontSize: 10, fontWeight: '700' }, legValues: { flexDirection: 'row', gap: 8 }, navValue: { flex: 1 }, navLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase' }, navNumber: { fontSize: 12, fontWeight: '900', marginTop: 3 }, noSolution: { fontSize: 11, fontWeight: '800' }, disclaimer: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  applyAllRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 }, applyAllButton: { minHeight: 48, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, applyAllText: { fontSize: 11, fontWeight: '900' }, noteInput: { minHeight: 68, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, textAlignVertical: 'top' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: 12 }, nearbySheet: { borderWidth: 1, borderRadius: 22, padding: 16, maxHeight: '78%' }, nearbyHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 }, nearbyTitle: { fontSize: 21, fontWeight: '900' }, nearbyLoading: { paddingVertical: 18, fontSize: 12 }, nearbyRow: { minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, nearbyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, nearbyNote: { fontSize: 9, lineHeight: 14, marginTop: 10 }
});
