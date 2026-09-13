import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ForecastGuidanceHour, ForecastModelGuidance } from '@/data/forecastGuidance';
import type { Airport } from '@/domain/models';
import { formatEpoch, isNightAt } from '@/domain/time';
import { formatTemperature, formatVisibility } from '@/domain/units';
import { openInAppBrowser } from '@/navigation/inAppBrowser';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

const SLOT_WIDTH = 112;

const condition = (code: number | null, isNight = false): { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] } => {
  if (code === null) return { label: 'Model data', icon: isNight ? 'cloudy-night-outline' : 'partly-sunny-outline' };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'thunderstorm-outline' };
  if (code >= 80) return { label: 'Showers', icon: 'rainy-outline' };
  if (code >= 71) return { label: 'Snow', icon: 'snow-outline' };
  if (code >= 51) return { label: 'Rain / drizzle', icon: 'rainy-outline' };
  if (code >= 45) return { label: 'Fog', icon: 'reorder-two-outline' };
  if (code >= 3) return { label: 'Overcast', icon: 'cloud-outline' };
  if (code >= 1) return { label: 'Partly cloudy', icon: isNight ? 'cloudy-night-outline' : 'partly-sunny-outline' };
  return { label: 'Clear', icon: isNight ? 'moon-outline' : 'sunny-outline' };
};

const windColor = (speedKt: number | null): string => {
  if (speedKt === null) return '#DCE5E8';
  if (speedKt >= 45) return '#D64C72';
  if (speedKt >= 35) return '#EA694F';
  if (speedKt >= 25) return '#F39A3F';
  if (speedKt >= 15) return '#C7DC31';
  if (speedKt >= 8) return '#55D66B';
  return '#6FD8D0';
};

const slotTime = (hour: ForecastGuidanceHour, airport: Airport, timeMode: 'local' | 'utc'): string =>
  formatEpoch(hour.at, airport, timeMode, {
    weekday: 'short', month: undefined, day: undefined, hour: '2-digit', minute: '2-digit'
  });

export function ForecastGuidance({
  guidance,
  airport,
  loading,
  error
}: {
  guidance: ForecastModelGuidance | undefined;
  airport: Airport;
  loading: boolean;
  error: boolean;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const slots = useMemo(() => {
    const now = Math.floor((guidance?.generatedAt ?? 0) / 1000);
    return (guidance?.hours ?? [])
      .filter((hour) => hour.at >= now - 3600)
      .filter((_, index) => index % 3 === 0)
      .slice(0, 8);
  }, [guidance]);
  const pressureLevels = [...(slots[0]?.levels ?? [])]
    .sort((a, b) => a.pressureHpa - b.pressureHpa)
    .map((level) => level.pressureHpa);
  const windyUrl = `https://www.windy.com/${airport.latitude.toFixed(4)}/${airport.longitude.toFixed(4)}?${airport.latitude.toFixed(4)},${airport.longitude.toFixed(4)},10`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}> 
          <Ionicons name="analytics-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>NOAA GFS MODEL GUIDANCE</Text>
          <Text style={[styles.title, { color: colors.text }]}>Weather outlook and winds aloft</Text>
        </View>
      </View>

      {loading ? <Text style={[styles.status, { color: colors.textMuted }]}>Loading forecast guidance…</Text> : null}
      {!loading && error ? <Text style={[styles.status, { color: colors.warning }]}>Model guidance is temporarily unavailable. METAR, TAF, and official warnings are unaffected.</Text> : null}
      {!loading && !error && slots.length === 0 ? <Text style={[styles.status, { color: colors.textMuted }]}>No upcoming model hours are available.</Text> : null}

      {slots.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Three-hour outlook</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.outlookRow}>
            {slots.map((hour) => {
              const weather = condition(hour.weatherCode, isNightAt(hour.at, airport));
              return (
                <View key={hour.at} style={[styles.outlookSlot, { backgroundColor: colors.surfaceRaised }]}> 
                  <Text style={[styles.slotTime, { color: colors.text }]}>{slotTime(hour, airport, preferences.time)}</Text>
                  <Ionicons name={weather.icon} size={25} color={colors.primary} />
                  <Text numberOfLines={2} style={[styles.condition, { color: colors.text }]}>{weather.label}</Text>
                  <Text style={[styles.temperature, { color: colors.text }]}>{formatTemperature(hour.temperatureC, preferences.temperature)}</Text>
                  <Text style={[styles.secondary, { color: colors.textMuted }]}>Dew {formatTemperature(hour.dewpointC, preferences.temperature)}</Text>
                  <Text style={[styles.secondary, { color: colors.textMuted }]}>{Math.round(hour.precipitationProbability ?? 0)}% precip · {hour.precipitationMm?.toFixed(1) ?? '—'} mm</Text>
                  <Text style={[styles.secondary, { color: colors.textMuted }]}>Vis {formatVisibility(hour.visibilityMeters === null ? null : hour.visibilityMeters / 1609.344, preferences.visibility)}</Text>
                  <Text style={[styles.windSummary, { color: colors.primary }]}>{Math.round(hour.windDirectionTrue ?? 0)}° {Math.round(hour.windSpeedKt ?? 0)} kt · G {Math.round(hour.windGustKt ?? 0)}</Text>
                </View>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Wind by altitude</Text>
          <View style={[styles.windTable, { borderColor: colors.border }]}> 
            <View style={[styles.altitudeLabels, { borderRightColor: colors.border }]}> 
              <View style={[styles.windHeader, { borderBottomColor: colors.border }]}><Text style={[styles.altitudeHeader, { color: colors.textMuted }]}>Approx. MSL</Text></View>
              {pressureLevels.map((level) => {
                const values = slots.map((slot) => slot.levels.find((item) => item.pressureHpa === level)?.altitudeFt ?? null).filter((value): value is number => value !== null);
                const altitude = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
                return <View key={level} style={[styles.altitudeCell, { borderBottomColor: colors.border }]}><Text style={[styles.altitude, { color: colors.text }]}>{altitude === null ? `${level} hPa` : `${Math.round(altitude / 100) * 100} ft`}</Text><Text style={[styles.pressure, { color: colors.textMuted }]}>{level} hPa</Text></View>;
              })}
              <View style={[styles.altitudeCell, { borderBottomColor: colors.border }]}><Text style={[styles.altitude, { color: colors.text }]}>Surface</Text><Text style={[styles.pressure, { color: colors.textMuted }]}>wind</Text></View>
              <View style={[styles.altitudeCell, { borderBottomColor: colors.border }]}><Text style={[styles.altitude, { color: colors.text }]}>Surface</Text><Text style={[styles.pressure, { color: colors.textMuted }]}>gust</Text></View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar style={styles.windScroll}>
              <View style={styles.windColumns}>
                {slots.map((hour) => (
                  <View key={hour.at} style={[styles.windColumn, { borderRightColor: colors.border }]}> 
                    <View style={[styles.windHeader, { borderBottomColor: colors.border }]}><Text style={[styles.windTime, { color: colors.text }]}>{slotTime(hour, airport, preferences.time)}</Text></View>
                    {pressureLevels.map((level) => {
                      const wind = hour.levels.find((item) => item.pressureHpa === level);
                      return (
                        <View key={level} style={[styles.windCell, { backgroundColor: windColor(wind?.speedKt ?? null), borderBottomColor: colors.border }]}> 
                          <Ionicons name="arrow-down" size={18} color="#17333A" style={{ transform: [{ rotate: `${wind?.directionTrue ?? 0}deg` }] }} />
                          <Text style={styles.windValue}>{wind?.speedKt === null || wind?.speedKt === undefined ? '—' : Math.round(wind.speedKt)}</Text>
                        </View>
                      );
                    })}
                    <View style={[styles.windCell, { backgroundColor: windColor(hour.windSpeedKt), borderBottomColor: colors.border }]}> 
                      <Ionicons name="arrow-down" size={18} color="#17333A" style={{ transform: [{ rotate: `${hour.windDirectionTrue ?? 0}deg` }] }} />
                      <Text style={styles.windValue}>{hour.windSpeedKt === null ? '—' : Math.round(hour.windSpeedKt)}</Text>
                    </View>
                    <View style={[styles.windCell, { backgroundColor: windColor(hour.windGustKt), borderBottomColor: colors.border }]}><Text style={styles.windValue}>{hour.windGustKt === null ? '—' : Math.round(hour.windGustKt)}</Text><Text style={styles.knots}>kt</Text></View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          <Text style={[styles.legend, { color: colors.textMuted }]}>Altitude increases upward from the surface rows. Arrows point downwind and numbers are knots. Times are {preferences.time === 'utc' ? 'UTC' : 'local'}. Pressure-level heights are approximate.</Text>
        </>
      ) : null}

      <Pressable accessibilityRole="link" onPress={() => openInAppBrowser(windyUrl, `Wind map for ${airport.weatherCode ?? airport.ident}`)} style={styles.link}>
        <Text style={[styles.linkText, { color: colors.primary }]}>Open wind map at this airport</Text>
        <Ionicons name="open-outline" size={16} color={colors.primary} />
      </Pressable>
      <Text style={[styles.footnote, { color: colors.textMuted }]}>Model source: NOAA GFS via Open-Meteo · Select GFS in Windy for the closest comparison. Values can still differ when the model run, interpolation, or update time differs. Model guidance only.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingText: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: '900', marginTop: 1 },
  status: { fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: 14, fontWeight: '900' },
  outlookRow: { gap: 8, paddingRight: 3 },
  outlookSlot: { width: 124, borderRadius: 13, padding: 10, alignItems: 'center', gap: 3 },
  slotTime: { fontSize: 12, fontWeight: '900' },
  condition: { minHeight: 32, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  temperature: { fontSize: 18, fontWeight: '900' },
  secondary: { fontSize: 9, lineHeight: 13, textAlign: 'center' },
  windSummary: { fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  windTable: { borderWidth: 1, borderRadius: 13, overflow: 'hidden', flexDirection: 'row' },
  altitudeLabels: { width: 88, borderRightWidth: 1 },
  windScroll: { flex: 1 },
  windColumns: { flexDirection: 'row' },
  windColumn: { width: SLOT_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  windHeader: { height: 48, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  altitudeHeader: { fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  altitudeCell: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  altitude: { fontSize: 11, fontWeight: '900' },
  pressure: { fontSize: 8, marginTop: 1 },
  windTime: { fontSize: 10, fontWeight: '900', textAlign: 'center' },
  windCell: { height: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  windValue: { color: '#17333A', fontSize: 14, fontWeight: '900' },
  knots: { color: '#17333A', fontSize: 9, fontWeight: '800' },
  legend: { fontSize: 9, lineHeight: 14 },
  link: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  linkText: { fontSize: 13, fontWeight: '800' },
  footnote: { fontSize: 10, lineHeight: 15 }
});
