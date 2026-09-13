import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Airport, TafForecast, TafPeriod, UnitPreferences } from '@/domain/models';
import { formatAltitude, formatSpeed, formatVisibility } from '@/domain/units';
import { buildTafTimeline, lowestCeilingFt, tafProbabilityLabel, upcomingTafHours } from '@/domain/weather';
import { formatEpoch, isNightAt } from '@/domain/time';
import { usePreferences } from '@/state/preferences';
import { categoryColors, useAppTheme } from '@/theme/theme';
import { FlightCategoryBadge } from './FlightCategoryBadge';
import { AviationWeatherIcon } from './AviationWeatherIcon';

const COLUMN_WIDTH = 138;
const ROW_HEIGHTS = {
  time: 66,
  probability: 50,
  code: 54,
  weather: 126,
  visibility: 52,
  ceiling: 52,
  wind: 72,
  speed: 48,
  gusts: 48,
  change: 154
} as const;

const WEATHER_LABELS: Record<string, string> = {
  RA: 'Rain', SN: 'Snow', BR: 'Mist', FG: 'Fog', HZ: 'Haze', TS: 'Thunderstorm',
  SHRA: 'Rain showers', TSRA: 'Thunderstorm rain', FZRA: 'Freezing rain', DZ: 'Drizzle',
  VCSH: 'Showers nearby', VCTS: 'Thunderstorm nearby'
};

const CLOUD_LABELS: Record<string, string> = {
  FEW: 'Few clouds', SCT: 'Scattered', BKN: 'Broken', OVC: 'Overcast',
  VV: 'Vertical visibility', NSC: 'No significant cloud', NCD: 'No cloud detected',
  CLR: 'Clear', SKC: 'Clear sky'
};

function Cell({
  height,
  children,
  label = false
}: React.PropsWithChildren<{ height: number; label?: boolean }>): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[
      styles.cell,
      { height, borderBottomColor: colors.border },
      label ? styles.labelCell : styles.valueCell
    ]}>
      {children}
    </View>
  );
}

function weatherText(period: TafPeriod | null): string {
  if (!period) return '—';
  if (period.weather.length > 0) {
    return period.weather
      .map((code) => WEATHER_LABELS[code.replace(/^[-+]/, '')] ?? code)
      .join(', ');
  }
  if (period.clouds.length > 0) {
    return period.clouds.map((cloud) => {
      const label = CLOUD_LABELS[cloud.cover] ?? cloud.cover;
      return `${label}${cloud.type ? ` ${cloud.type}` : ''}`;
    }).join(', ');
  }
  return 'No significant weather';
}

function overlayText(overlay: TafPeriod, preferences: UnitPreferences): string {
  const details: string[] = [];
  if (overlay.weather.length > 0 || overlay.clouds.length > 0) details.push(weatherText(overlay));
  if (overlay.visibilitySm !== null) {
    details.push(formatVisibility(overlay.visibilitySm, preferences.visibility, {
      qualifier: overlay.visibilityQualifier,
      tenKmOrMore: overlay.visibilityIsTenKmOrMore
    }));
  }
  const ceiling = lowestCeilingFt(overlay.clouds, overlay.verticalVisibilityFt);
  if (ceiling !== null) details.push(`ceiling ${formatAltitude(ceiling, preferences.altitude)}`);
  if (overlay.windSpeedKt !== null) {
    const direction = overlay.windDirectionTrue === null ? 'VRB' : `${Math.round(overlay.windDirectionTrue)}°`;
    const gust = overlay.windGustKt === null ? '' : ` G ${formatSpeed(overlay.windGustKt, preferences.speed)}`;
    details.push(`${direction} ${formatSpeed(overlay.windSpeedKt, preferences.speed)}${gust}`);
  }
  return details.length > 0 ? details.join(' · ') : 'Temporary conditions';
}

function changeText(overlays: TafPeriod[], preferences: UnitPreferences): string {
  const labels = overlays.map((overlay) => {
    const probability = overlay.probability ? ` ${overlay.probability}%` : '';
    return `${overlay.change}${probability}: ${overlayText(overlay, preferences)}`;
  });
  return labels.length > 0 ? labels.join('\n') : '—';
}

export function TafTimeline({ forecast, airport, nowMs }: { forecast: TafForecast; airport: Airport; nowMs: number }): React.JSX.Element {
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const currentHourMs = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const timeline = useMemo(
    () => upcomingTafHours(buildTafTimeline(forecast), currentHourMs),
    [forecast, currentHourMs]
  );

  const validFrom = formatEpoch(forecast.validFrom, airport, preferences.time, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const validTo = formatEpoch(forecast.validTo, airport, preferences.time, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <View style={styles.container}>
      <View>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>HOURLY FORECAST</Text>
        <Text style={[styles.heading, { color: colors.text }]}>TAF timeline</Text>
        <Text style={[styles.validity, { color: colors.textMuted }]}>Valid {validFrom} to {validTo}</Text>
      </View>

      {timeline.length === 0 ? (
        <View style={[styles.ended, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Ionicons name="time-outline" size={21} color={colors.textMuted} />
          <Text style={[styles.endedText, { color: colors.textMuted }]}>This forecast period has ended. Pull down to check for a newer TAF.</Text>
        </View>
      ) : <View style={[styles.table, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <View style={[styles.labels, { borderRightColor: colors.border }]}>
          <Cell height={ROW_HEIGHTS.time} label><Text style={[styles.label, { color: colors.textMuted }]}>Time</Text></Cell>
          <Cell height={ROW_HEIGHTS.probability} label><Text style={[styles.label, { color: colors.textMuted }]}>Probability</Text></Cell>
          <Cell height={ROW_HEIGHTS.code} label><Text style={[styles.label, { color: colors.textMuted }]}>Code</Text></Cell>
          <Cell height={ROW_HEIGHTS.weather} label><Text style={[styles.label, { color: colors.textMuted }]}>Weather</Text></Cell>
          <Cell height={ROW_HEIGHTS.visibility} label><Text style={[styles.label, { color: colors.textMuted }]}>Visibility</Text></Cell>
          <Cell height={ROW_HEIGHTS.ceiling} label><Text style={[styles.label, { color: colors.textMuted }]}>Ceiling</Text></Cell>
          <Cell height={ROW_HEIGHTS.wind} label><Text style={[styles.label, { color: colors.textMuted }]}>Wind</Text></Cell>
          <Cell height={ROW_HEIGHTS.speed} label><Text style={[styles.label, { color: colors.textMuted }]}>Speed</Text></Cell>
          <Cell height={ROW_HEIGHTS.gusts} label><Text style={[styles.label, { color: colors.textMuted }]}>Gusts</Text></Cell>
          <Cell height={ROW_HEIGHTS.change} label><Text style={[styles.label, { color: colors.textMuted }]}>Changes</Text></Cell>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar style={styles.timelineScroll}>
          <View style={styles.columns}>
            {timeline.map((hour) => {
              const period = hour.prevailing;
              const category = period?.category ?? 'UNKNOWN';
              const palette = categoryColors[category];
              const ceiling = period ? lowestCeilingFt(period.clouds, period.verticalVisibilityFt) : null;
              const direction = period?.windDirectionTrue ?? null;
              return (
                <View key={hour.at} style={[styles.column, { borderRightColor: colors.border }]}>
                  <Cell height={ROW_HEIGHTS.time}>
                    <Text style={[styles.day, { color: colors.textMuted }]}>
                      {formatEpoch(hour.at, airport, preferences.time, { weekday: 'short', month: undefined, day: undefined, hour: undefined, minute: undefined })}
                    </Text>
                    <Text style={[styles.time, { color: colors.text }]}>
                      {formatEpoch(hour.at, airport, preferences.time, { month: undefined, day: undefined, hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.probability}>
                    <View style={[styles.probabilityPill, { borderColor: hour.overlays.length > 0 ? colors.primary : 'transparent' }]}> 
                      <Text style={[styles.probability, { color: hour.overlays.length > 0 ? colors.primary : colors.textMuted }]}>{tafProbabilityLabel(hour)}</Text>
                    </View>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.code}><FlightCategoryBadge category={category} centered /></Cell>
                  <Cell height={ROW_HEIGHTS.weather}>
                    <AviationWeatherIcon period={period} isNight={isNightAt(hour.at, airport)} />
                    <Text style={[styles.weather, { color: colors.text }]}>{weatherText(period)}</Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.visibility}>
                    <Text style={[styles.value, { color: colors.text }]}>
                      {period ? formatVisibility(period.visibilitySm, preferences.visibility, {
                        qualifier: period.visibilityQualifier,
                        tenKmOrMore: period.visibilityIsTenKmOrMore
                      }) : '—'}
                    </Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.ceiling}>
                    <Text style={[styles.value, { color: colors.text }]}>{formatAltitude(ceiling, preferences.altitude)}</Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.wind}>
                    {direction === null ? (
                      <Text style={[styles.value, { color: colors.text }]}>{period?.windSpeedKt !== null ? 'VRB' : '—'}</Text>
                    ) : (
                      <>
                        <Ionicons name="arrow-down" size={24} color={colors.primary} style={{ transform: [{ rotate: `${direction}deg` }] }} />
                        <Text style={[styles.value, { color: colors.text }]}>{Math.round(direction)}°</Text>
                      </>
                    )}
                  </Cell>
                  <Cell height={ROW_HEIGHTS.speed}>
                    <Text style={[styles.value, { color: colors.text }]}>{formatSpeed(period?.windSpeedKt ?? null, preferences.speed)}</Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.gusts}>
                    <Text style={[styles.value, { color: colors.text }]}>{formatSpeed(period?.windGustKt ?? null, preferences.speed)}</Text>
                  </Cell>
                  <Cell height={ROW_HEIGHTS.change}>
                    <View style={[styles.changePill, { backgroundColor: hour.overlays.length > 0 ? palette.background : 'transparent' }]}> 
                      <Text style={[styles.change, { color: hour.overlays.length > 0 ? palette.foreground : colors.textMuted }]}> 
                        {changeText(hour.overlays, preferences)}
                      </Text>
                    </View>
                  </Cell>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>}
      {timeline.length > 0 ? <Text style={[styles.hint, { color: colors.textMuted }]}>Past hours are hidden. Swipe horizontally to inspect each remaining forecast hour. Main cells show prevailing conditions; temporary and probability groups appear under Changes. “&gt;40%” marks TEMPO without an explicit PROB group.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heading: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  validity: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  table: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', flexDirection: 'row' },
  labels: { width: 92, borderRightWidth: 1 },
  timelineScroll: { flex: 1 },
  columns: { flexDirection: 'row' },
  column: { width: COLUMN_WIDTH, borderRightWidth: StyleSheet.hairlineWidth },
  cell: { borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  labelCell: { paddingHorizontal: 11, alignItems: 'flex-start' },
  valueCell: { paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  label: { fontSize: 12, fontWeight: '700' },
  day: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  time: { fontSize: 16, fontWeight: '900' },
  probabilityPill: { minWidth: 58, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  probability: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  weather: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  value: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  changePill: { borderRadius: 9, paddingHorizontal: 6, paddingVertical: 5, width: '100%' },
  change: { fontSize: 10, lineHeight: 14, textAlign: 'center', fontWeight: '700' },
  hint: { fontSize: 11, textAlign: 'center' },
  ended: { borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 9 },
  endedText: { flex: 1, fontSize: 12, lineHeight: 18 }
});
