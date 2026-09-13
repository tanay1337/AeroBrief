import { useForegroundGps } from '@/hooks/useForegroundGps';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AeronauticalMap, type AeronauticalMapRef } from '@/components/AeronauticalMap';
import { StateNotice } from '@/components/StateNotice';
import { getPlannedFlight } from '@/data/plannedFlights';
import { getFlightRouteSnapshot, getRoutePlan } from '@/data/routePlans';
import { calculateRoute, formatRouteDuration, getAiracCycleAt, type RouteLeg } from '@/domain/routePlanning';
import { routePlanViewQueryKey } from '@/navigation/routePlanView';
import { useAppTheme } from '@/theme/theme';

const heading = (value: number | null): string => value === null ? '—' : `${(Math.round(value) % 360).toString().padStart(3, '0')}°`;
const signedAngle = (value: number | null): string => value === null ? '—' : `${value >= 0 ? '+' : ''}${Math.round(value)}°`;

export default function RoutePlanViewScreen(): React.JSX.Element {
  const { flightId, id, plannedFlightId } = useLocalSearchParams<{ flightId?: string; id?: string; plannedFlightId?: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const gps = useForegroundGps();
  const previewMapRef = useRef<AeronauticalMapRef>(null);
  const fullMapRef = useRef<AeronauticalMapRef>(null);
  const previewFitted = useRef(false);
  const fullFitted = useRef(false);
  const [mapOpen, setMapOpen] = useState(false);
  const closeMap = () => { fullFitted.current = false; setMapOpen(false); };
  const route = useQuery({
    // The logbook screen caches a FlightRouteSnapshot under ['flight-route', flightId].
    // This screen needs the nested RoutePlan, so it must not reuse that differently shaped cache entry.
    queryKey: [...routePlanViewQueryKey(id, flightId), plannedFlightId ?? null],
    queryFn: async () => {
      if (plannedFlightId) { const current = await getPlannedFlight(db, plannedFlightId); return current?.routePlanId ? getRoutePlan(db, current.routePlanId) : null; }
      return id ? getRoutePlan(db, id) : (await getFlightRouteSnapshot(db, flightId!))?.plan ?? null;
    },
    enabled: Boolean(id || flightId || plannedFlightId)
  });
  const { refetch } = route;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const plan = route.data;
  const summary = useMemo(() => plan ? calculateRoute(plan.waypoints, plan.cruiseSpeedKt, plan.fuelBurnPerHour, plan.windDirectionTrue, plan.windSpeedKt) : null, [plan]);

  if (route.isLoading) return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}><StateNotice loading title="Loading navlog" /></View>;
  if (!plan || !summary) return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}><StateNotice title="Route unavailable" body="The saved route could not be opened." /></View>;

  const first = plan.waypoints[0];
  const cycle = plan.airacCycle || getAiracCycleAt();
  const windLabel = plan.windSpeedKt === 0 ? 'Calm · 0 kt' : plan.windDirectionTrue === null || plan.windSpeedKt === null
    ? 'Still air / no wind loaded'
    : `${heading(plan.windDirectionTrue)}T / ${Math.round(plan.windSpeedKt)} kt`;
  const stationDistance = plan.windStationDistanceKm !== null && plan.windStationDistanceKm !== undefined && plan.windStationDistanceKm >= 0.5
    ? ` · ${Math.round(plan.windStationDistanceKm)} km from ${first?.ident ?? 'departure'}`
    : '';
  const weatherSource = plan.windSource === 'METAR' && plan.windStation
    ? `${plan.windStation} METAR${stationDistance}${plan.windObservedAt ? ` · ${new Date(plan.windObservedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : ''}`
    : plan.windSource === 'MANUAL' ? 'Manually entered wind' : 'No weather source saved';

  return <>
    <Stack.Screen options={{ title: 'Navlog', headerRight: id ? () => <Pressable accessibilityRole="button" accessibilityLabel="Edit saved route" hitSlop={9} onPress={() => router.push({ pathname: '/route-planner', params: { id: plan.id, flightId: plannedFlightId } })}><Ionicons name="create-outline" size={24} color={colors.text} /></Pressable> : undefined }} />
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}><Text style={[styles.eyebrow, { color: colors.primary }]}>IN-FLIGHT NAVLOG</Text><Text style={[styles.title, { color: colors.text }]}>{plan.title}</Text></View>
        <View style={[styles.airacPill, { backgroundColor: colors.primarySoft }]}><Text style={[styles.airacText, { color: colors.primary }]}>AIRAC {cycle}</Text></View>
      </View>
      {plan.title.replace(/\s+to\s+/gi, ' → ') !== plan.waypoints.map((point) => point.ident).join(' → ') ? <Text numberOfLines={2} style={[styles.route, { color: colors.textMuted }]}>{plan.waypoints.map((point) => point.ident).join(' → ')}</Text> : null}

      <View style={styles.summaryRow}>
        <SummaryValue label="Distance" value={`${summary.distanceNm.toFixed(1)} NM`} />
        <SummaryValue label="EET" value={formatRouteDuration(summary.estimatedMinutes)} />
        <SummaryValue label="Est. fuel" value={summary.estimatedFuel === null ? '—' : `${summary.estimatedFuel.toFixed(1)} ${plan.fuelUnit === 'US_GAL' ? 'US gal' : 'L'}`} />
      </View>

      <View style={[styles.mapCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.mapPreview}>
          <AeronauticalMap currentPosition={gps.position} ref={previewMapRef} waypoints={plan.waypoints} cycle={cycle} aeronauticalLayerVisible baseLayer="chart" initialCenter={first ? { latitude: first.latitude, longitude: first.longitude } : undefined} onReady={() => { if (!previewFitted.current) { previewFitted.current = true; setTimeout(() => previewMapRef.current?.fitRoute(), 100); } }} onLongPress={() => undefined} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Reload route chart tiles" onPress={() => previewMapRef.current?.refreshTiles()} style={[styles.mapRefresh, { backgroundColor: colors.surface }]}><Ionicons name="refresh-outline" size={20} color={colors.primary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Maximize route map" onPress={() => setMapOpen(true)} style={[styles.maximize, { backgroundColor: colors.surface }]}><Ionicons name="expand-outline" size={18} color={colors.primary} /><Text style={[styles.maximizeText, { color: colors.primary }]}>Full-screen map</Text></Pressable>
      </View>

      <View style={[styles.weatherCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.weatherIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="flag-outline" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.weatherWind, { color: colors.text }]}>{windLabel}</Text><Text style={[styles.weatherSource, { color: colors.textMuted }]}>{weatherSource}</Text></View>
      </View>

      {gps.available ? <Pressable accessibilityRole="button" onPress={() => void gps.toggle()}><Text style={{ color: colors.primary, padding: 12 }}>{gps.status} · {gps.enabled ? 'Stop GPS' : 'Start GPS'}</Text></Pressable> : null}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Leg navigation</Text>
      <Text style={[styles.sectionHelper, { color: colors.textMuted }]}>{!plan.cruiseSpeedKt ? 'Set TAS in the route editor to calculate WCA, headings and time.' : plan.windSpeedKt === null || (plan.windSpeedKt !== 0 && plan.windDirectionTrue === null) ? 'Wind is not applied. Time and fuel are still-air estimates; add wind for WCA and headings.' : 'Magnetic headings and wind corrections use the wind saved with this route.'}</Text>
      {summary.legs.map((leg, index) => {
        const completedLegs = summary.legs.slice(0, index + 1);
        const travelledDistance = completedLegs.reduce((total, item) => total + item.distanceNm, 0);
        const elapsedMinutes = completedLegs.reduce((total, item) => total + (item.estimatedMinutes ?? 0), 0);
        const usedFuel = completedLegs.reduce((total, item) => total + (item.estimatedFuel ?? 0), 0);
        return <NavlogLeg key={`${leg.from.id}-${leg.to.id}`} index={index} leg={leg} remainingDistance={Math.max(0, summary.distanceNm - travelledDistance)} cumulativeMinutes={summary.estimatedMinutes === null ? null : elapsedMinutes} cumulativeFuel={summary.estimatedFuel === null ? null : usedFuel} fuelUnit={plan.fuelUnit} />;
      })}
      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Planning aid only. Use current approved charts and verify position, airspace, terrain, weather, NOTAMs, fuel, and aircraft performance during flight.</Text>
    </ScrollView>

    <Modal visible={mapOpen} animationType="fade" onRequestClose={closeMap}>
      <SafeAreaView style={[styles.fullMap, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.fullMapHeader, { borderBottomColor: colors.border }]}><View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.fullMapTitle, { color: colors.text }]}>{plan.title}</Text><Text style={[styles.fullMapMeta, { color: colors.textMuted }]}>{summary.distanceNm.toFixed(1)} NM · {formatRouteDuration(summary.estimatedMinutes)} EET</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close full-screen map" hitSlop={10} onPress={closeMap} style={[styles.closeButton, { backgroundColor: colors.surface }]}><Ionicons name="close" size={27} color={colors.text} /></Pressable></View>
        <View style={{ flexDirection: 'row', padding: 8, gap: 16 }}><Pressable accessibilityRole="button" onPress={() => fullMapRef.current?.refreshTiles()}><Text style={{ color: colors.primary }}>Reload chart</Text></Pressable>{gps.available ? <><Pressable onPress={() => void gps.toggle()}><Text style={{ color: colors.primary }}>{gps.status} · {gps.enabled ? 'Stop' : 'Start'}</Text></Pressable>{gps.position ? <Pressable onPress={() => fullMapRef.current?.flyTo(gps.position!.longitude, gps.position!.latitude, 13)}><Text style={{ color: colors.primary }}>Center on GPS</Text></Pressable> : null}</> : null}</View>
        <View style={{ flex: 1 }}><AeronauticalMap currentPosition={gps.position} ref={fullMapRef} waypoints={plan.waypoints} cycle={cycle} aeronauticalLayerVisible baseLayer="chart" initialCenter={first ? { latitude: first.latitude, longitude: first.longitude } : undefined} onReady={() => { if (!fullFitted.current) { fullFitted.current = true; setTimeout(() => fullMapRef.current?.fitRoute(), 100); } }} onLongPress={() => undefined} /></View>
      </SafeAreaView>
    </Modal>
  </>;
}

function SummaryValue({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={[styles.summaryValue, { backgroundColor: colors.primarySoft }]}><Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text><Text style={[styles.summaryNumber, { color: colors.text }]}>{value}</Text></View>;
}

function NavlogLeg({ index, leg, remainingDistance, cumulativeMinutes, cumulativeFuel, fuelUnit }: { index: number; leg: RouteLeg; remainingDistance: number; cumulativeMinutes: number | null; cumulativeFuel: number | null; fuelUnit: 'L' | 'US_GAL' }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={[styles.legCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.legHeader}><View style={[styles.legNumber, { backgroundColor: colors.primary }]}><Text style={styles.legNumberText}>{index + 1}</Text></View><View style={{ flex: 1 }}><Text style={[styles.legTitle, { color: colors.text }]}>{leg.from.ident} → {leg.to.ident}</Text><Text numberOfLines={1} style={[styles.legName, { color: colors.textMuted }]}>{leg.to.name}</Text></View><View style={styles.nextBlock}><Text style={[styles.nextLabel, { color: colors.textMuted }]}>LEG</Text><Text style={[styles.nextValue, { color: colors.text }]}>{leg.distanceNm.toFixed(1)} NM</Text></View></View>
    <View style={[styles.primaryNav, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
      <LegValue label="Mag heading" value={`${heading(leg.magneticHeading)}M`} prominent />
      <LegValue label="Groundspeed" value={leg.groundSpeedKt === null ? '—' : `${Math.round(leg.groundSpeedKt)} kt`} prominent />
      <LegValue label="Altitude" value={leg.plannedAltitudeFt === null ? '—' : `${Math.round(leg.plannedAltitudeFt)} ft`} prominent />
    </View>
    <View style={styles.secondaryNav}>
      <LegValue label="Mag track" value={`${heading(leg.magneticTrack)}M`} />
      <LegValue label="WCA" value={signedAngle(leg.windCorrectionAngle)} />
      <LegValue label="Leg time" value={formatRouteDuration(leg.estimatedMinutes)} />
    </View>
    <View style={[styles.progressRow, { backgroundColor: colors.surfaceRaised }]}> 
      <LegValue label="Distance rem." value={`${remainingDistance.toFixed(1)} NM`} />
      <LegValue label="Elapsed ETE" value={formatRouteDuration(cumulativeMinutes)} />
      <LegValue label="Fuel used" value={cumulativeFuel === null ? '—' : `${cumulativeFuel.toFixed(1)} ${fuelUnit === 'US_GAL' ? 'gal' : 'L'}`} />
    </View>
    {leg.note ? <View style={[styles.noteRow, { backgroundColor: colors.primarySoft }]}><Ionicons name="reader-outline" size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.noteLabel, { color: colors.primary }]}>LEG NOTE</Text><Text style={[styles.noteText, { color: colors.text }]}>{leg.note}</Text></View></View> : null}
    {!leg.windSolutionPossible ? <Text style={[styles.warning, { color: colors.danger }]}>No valid wind solution for this leg and TAS.</Text> : null}
  </View>;
}

function LegValue({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <View style={styles.legValue}><Text style={[styles.legLabel, { color: colors.textMuted }]}>{label}</Text><Text numberOfLines={1} style={[prominent ? styles.legProminent : styles.legValueText, { color: colors.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, center: { justifyContent: 'center' }, content: { padding: 16, paddingBottom: 42, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { fontSize: 25, fontWeight: '900', marginTop: 3 }, airacPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }, airacText: { fontSize: 9, fontWeight: '900' }, route: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 8 }, summaryValue: { flex: 1, minHeight: 66, borderRadius: 15, padding: 10, justifyContent: 'center' }, summaryLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 }, summaryNumber: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  mapCard: { height: 310, borderWidth: 1, borderRadius: 20, overflow: 'hidden' }, mapPreview: { flex: 1 }, mapRefresh: { position: 'absolute', right: 10, top: 10, minWidth: 40, minHeight: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', elevation: 4 }, maximize: { position: 'absolute', right: 10, bottom: 10, minHeight: 40, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, elevation: 4 }, maximizeText: { fontSize: 11, fontWeight: '900' },
  weatherCard: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, weatherIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, weatherWind: { fontSize: 15, fontWeight: '900' }, weatherSource: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { fontSize: 22, fontWeight: '900', marginTop: 5 }, sectionHelper: { fontSize: 10, lineHeight: 15, marginTop: -8 },
  legCard: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 10 }, legHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, legNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, legNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, legTitle: { fontSize: 16, fontWeight: '900' }, legName: { fontSize: 9, marginTop: 2 }, nextBlock: { alignItems: 'flex-end' }, nextLabel: { fontSize: 8, fontWeight: '900' }, nextValue: { fontSize: 12, fontWeight: '900', marginTop: 2 },
  primaryNav: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11, gap: 8 }, secondaryNav: { flexDirection: 'row', gap: 8 }, progressRow: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10 }, noteRow: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, noteLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.35 }, noteText: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginTop: 3 }, legValue: { flex: 1 }, legLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.25 }, legProminent: { fontSize: 15, fontWeight: '900', marginTop: 4 }, legValueText: { fontSize: 11, fontWeight: '900', marginTop: 3 }, warning: { fontSize: 10, lineHeight: 15, fontWeight: '800' },
  disclaimer: { fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 8 },
  fullMap: { flex: 1 }, fullMapHeader: { minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, fullMapTitle: { fontSize: 18, fontWeight: '900' }, fullMapMeta: { fontSize: 10, fontWeight: '700', marginTop: 3 }, closeButton: { width: 45, height: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }
});
