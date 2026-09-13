import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MetarObservation } from '@/domain/models';
import { lowestCeilingFt } from '@/domain/weather';
import { formatAltitude, formatPressure, formatSpeed, formatTemperature, formatVisibility } from '@/domain/units';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';
import { FlightCategoryBadge } from './FlightCategoryBadge';
import { MetricCard } from './MetricCard';

const WEATHER_LABELS: Record<string, string> = {
  RA: 'Rain', SN: 'Snow', BR: 'Mist', FG: 'Fog', HZ: 'Haze', TS: 'Thunderstorm',
  SHRA: 'Rain showers', TSRA: 'Thunderstorm with rain', FZRA: 'Freezing rain', DZ: 'Drizzle',
  VCSH: 'Showers nearby', VCTS: 'Thunderstorm nearby'
};

const describeWeather = (codes: string[]): string => {
  if (codes.length === 0) return 'No significant weather';
  return codes.map((code) => WEATHER_LABELS[code.replace(/^[-+]/, '')] ?? code).join(', ');
};

const CLOUD_COVERS: Record<string, string> = {
  FEW: 'Few',
  SCT: 'Scattered',
  BKN: 'Broken',
  OVC: 'Overcast',
  VV: 'Vertical visibility',
  CLR: 'Clear',
  SKC: 'Clear sky',
  NSC: 'No significant cloud',
  NCD: 'No cloud detected'
};

export function WeatherOverview({ metar }: { metar: MetarObservation }): React.JSX.Element {
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const ceiling = lowestCeilingFt(metar.clouds, metar.verticalVisibilityFt);
  const windDirection = metar.windDirectionTrue === null ? 'Variable' : `${Math.round(metar.windDirectionTrue)}°`;
  const gust = metar.windGustKt === null ? undefined : `Gusting ${formatSpeed(metar.windGustKt, preferences.speed)}`;
  const actionableTrends = (metar.trends ?? []).filter((trend) => trend.change !== 'NOSIG');
  const cloudDetail = metar.cavok
    ? 'No cloud below 5,000 ft or the highest MSA (whichever is higher); no CB or TCU'
    : metar.clouds.length > 0
      ? metar.clouds.map((cloud) => {
        const cover = CLOUD_COVERS[cloud.cover] ?? cloud.cover;
        const base = cloud.baseFt !== null ? ` at ${formatAltitude(cloud.baseFt, preferences.altitude)}` : '';
        return `${cover}${base}${cloud.type ? ` ${cloud.type}` : ''}`;
      }).join(' · ')
      : 'No cloud information reported';
  return (
    <View style={styles.container}>
      <View style={styles.categoryRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>FLIGHT CONDITIONS</Text>
          <Text style={[styles.heading, { color: colors.text }]}>Current observation</Text>
        </View>
        <FlightCategoryBadge category={metar.category} />
      </View>
      <View style={styles.grid}>
        <MetricCard icon="navigate" label="Wind" value={formatSpeed(metar.windSpeedKt, preferences.speed)} detail={`${windDirection}${gust ? ` · ${gust}` : ''}`} />
        <MetricCard
          icon="eye"
          label="Visibility"
          value={formatVisibility(metar.visibilitySm, preferences.visibility, {
            qualifier: metar.visibilityQualifier,
            tenKmOrMore: metar.visibilityIsTenKmOrMore
          })}
          help={metar.visibilityIsTenKmOrMore ? 'ICAO 9999 indicates visibility of at least 10 km and is also the visibility threshold used for CAVOK.' : undefined}
        />
        <MetricCard icon="cloud" label="Ceiling" value={metar.cavok ? 'No low cloud' : formatAltitude(ceiling, preferences.altitude)} help={cloudDetail} />
        <MetricCard
          icon="rainy"
          label="Weather"
          value={describeWeather(metar.weather)}
          help={metar.cavok ? 'No significant weather was reported at or near the aerodrome under CAVOK conditions.' : undefined}
        />
        <MetricCard icon="thermometer" label="Temperature" value={formatTemperature(metar.temperatureC, preferences.temperature)} detail={`Dew point ${formatTemperature(metar.dewpointC, preferences.temperature)}`} />
        <MetricCard icon="speedometer" label="Pressure" value={formatPressure(metar.pressureHpa, preferences.pressure)} />
      </View>
      {actionableTrends.length > 0 ? (
        <View style={[styles.trendsCard, { backgroundColor: colors.surface, borderColor: colors.warning }]}> 
          <View style={styles.trendsHeading}>
            <Ionicons name="warning-outline" size={20} color={colors.warning} />
            <View style={styles.trendsHeadingText}>
              <Text style={[styles.trendsEyebrow, { color: colors.warning }]}>METAR TREND</Text>
              <Text style={[styles.trendsTitle, { color: colors.text }]}>Expected temporary or changing conditions</Text>
            </View>
          </View>
          {actionableTrends.map((trend, index) => {
            const details: string[] = [];
            if (trend.windSpeedKt !== null) {
              const direction = trend.windDirectionTrue === null ? 'Variable' : `${Math.round(trend.windDirectionTrue)}°`;
              const gusting = trend.windGustKt === null ? '' : `, gusting ${formatSpeed(trend.windGustKt, preferences.speed)}`;
              details.push(`${direction} ${formatSpeed(trend.windSpeedKt, preferences.speed)}${gusting}`);
            }
            if (trend.visibilitySm !== null) {
              details.push(formatVisibility(trend.visibilitySm, preferences.visibility, {
                qualifier: trend.visibilityIsTenKmOrMore ? 'MORE_THAN' : null,
                tenKmOrMore: trend.visibilityIsTenKmOrMore
              }));
            }
            if (trend.weather.length > 0) details.push(describeWeather(trend.weather));
            if (trend.clouds.length > 0) {
              details.push(trend.clouds.map((cloud) => {
                const cover = CLOUD_COVERS[cloud.cover] ?? cloud.cover;
                const base = cloud.baseFt === null ? '' : ` at ${formatAltitude(cloud.baseFt, preferences.altitude)}`;
                return `${cover}${base}${cloud.type ? ` ${cloud.type}` : ''}`;
              }).join(' · '));
            }
            if (trend.verticalVisibilityFt !== null) details.push(`Vertical visibility ${formatAltitude(trend.verticalVisibilityFt, preferences.altitude)}`);
            return (
              <View key={`${trend.change}-${index}`} style={[styles.trend, { backgroundColor: colors.surfaceRaised }]}> 
                <Text style={[styles.trendBadge, { color: colors.warning }]}>{trend.change}</Text>
                <Text style={[styles.trendDetails, { color: colors.text }]}>{details.length > 0 ? details.join(' · ') : 'No significant change'}</Text>
                <Text selectable style={[styles.trendRaw, { color: colors.textMuted }]}>{trend.raw}</Text>
              </View>
            );
          })}
          <Text style={[styles.trendsNote, { color: colors.textMuted }]}>This is part of the issued METAR, not the current observation. Check the raw report and valid trend period before use.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heading: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  trendsCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  trendsHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  trendsHeadingText: { flex: 1 },
  trendsEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  trendsTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 1 },
  trend: { borderRadius: 12, padding: 11, gap: 3 },
  trendBadge: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  trendDetails: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  trendRaw: { fontSize: 10, lineHeight: 15 },
  trendsNote: { fontSize: 10, lineHeight: 15 }
});
