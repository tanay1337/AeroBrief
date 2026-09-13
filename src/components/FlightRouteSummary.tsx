import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { calculateRoute, formatRouteDuration, type RoutePlan } from '@/domain/routePlanning';
import { useAppTheme } from '@/theme/theme';

export function FlightRouteSummary({ plan }: { plan: RoutePlan }): React.JSX.Element {
  const { colors } = useAppTheme();
  const summary = calculateRoute(plan.waypoints, plan.cruiseSpeedKt, plan.fuelBurnPerHour, plan.windDirectionTrue, plan.windSpeedKt);
  const altitudes = plan.waypoints.slice(1).map((point) => point.plannedAltitudeFt).filter((altitude): altitude is number => altitude != null);
  const altitude = altitudes.length ? `${Math.min(...altitudes).toLocaleString()}${Math.max(...altitudes) !== Math.min(...altitudes) ? `–${Math.max(...altitudes).toLocaleString()}` : ''} ft${altitudes.length < plan.waypoints.length - 1 ? ' · partial' : ''}` : null;
  const windKnown = plan.windSpeedKt === 0 || (plan.windDirectionTrue !== null && plan.windSpeedKt !== null);
  const defaultTitle = `${plan.waypoints[0]?.ident} to ${plan.waypoints.at(-1)?.ident}`;
  const metrics = [
    { label: 'Distance', value: `${summary.distanceNm.toFixed(1)} NM` },
    { label: 'EET', value: formatRouteDuration(summary.estimatedMinutes) },
    { label: 'Trip fuel', value: summary.estimatedFuel !== null ? `${summary.estimatedFuel.toFixed(1)} ${plan.fuelUnit === 'US_GAL' ? 'gal' : 'L'}` : '—' }
  ];
  return <View style={styles.group}>
    {plan.title !== defaultTitle ? <Text style={[styles.name, { color: colors.text }]}>{plan.title}</Text> : null}
    <Text style={[styles.chain, { color: colors.text }]}>{plan.waypoints.map((point) => point.ident).join(' → ')}</Text>
    <View style={styles.metrics}>{metrics.map((metric) => <View key={metric.label} style={[styles.metric, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.label, { color: colors.textMuted }]}>{metric.label}</Text><Text style={[styles.value, { color: colors.text }]}>{metric.value}</Text></View>)}</View>
    <Text style={[styles.meta, { color: colors.textMuted }]}>{plan.waypoints.length} waypoints · AIRAC {plan.airacCycle}{plan.cruiseSpeedKt !== null ? ` · TAS ${plan.cruiseSpeedKt} kt` : ''}{altitude ? ` · ${altitude}` : ''}</Text>
    <Text style={[styles.meta, { color: colors.textMuted }]}>{windKnown ? `${plan.windSource === 'METAR' ? `${plan.windStation ?? 'METAR'} surface wind` : 'Planned wind'} · ${plan.windSpeedKt === 0 ? 'Calm' : `${plan.windDirectionTrue}°T / ${plan.windSpeedKt} kt`}` : 'Wind not set · still-air estimate'}</Text>
    {plan.cruiseSpeedKt === null ? <Text style={[styles.meta, { color: colors.textMuted }]}>Add TAS in the route editor for EET and wind correction.</Text> : plan.fuelBurnPerHour === null ? <Text style={[styles.meta, { color: colors.textMuted }]}>Add fuel burn in the route editor for trip fuel.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  group: { gap: 8 }, name: { fontSize: 14, fontWeight: '800' }, chain: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 7 }, metric: { flex: 1, borderRadius: 12, padding: 10, gap: 4 },
  label: { fontSize: 10, fontWeight: '700' }, value: { fontSize: 16, fontWeight: '800' }, meta: { fontSize: 11, lineHeight: 17 }
});
