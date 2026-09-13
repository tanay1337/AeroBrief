import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Airport, WeatherBundle } from '@/domain/models';
import { lowestCeilingFt } from '@/domain/weather';
import { formatAltitude, formatSpeed, formatVisibility } from '@/domain/units';
import { observationAge } from '@/domain/time';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';
import { FlightCategoryBadge } from './FlightCategoryBadge';

interface Props {
  airport: Airport;
  weather?: WeatherBundle;
  onPress: () => void;
  showWeather?: boolean;
  showLocation?: boolean;
  weatherLoading?: boolean;
  weatherSource?: { icao: string; distanceKm: number };
}

export function AirportListItem({ airport, weather, onPress, showWeather = true, showLocation = true, weatherLoading = false, weatherSource }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const metar = weather?.metar;
  const ceiling = metar ? lowestCeilingFt(metar.clouds, metar.verticalVisibilityFt) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${airport.ident}, ${airport.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <View style={styles.codeRow}>
            <Text style={[styles.ident, { color: colors.text }]}>{airport.weatherCode ?? airport.ident}</Text>
            {airport.iataCode ? <Text style={[styles.iata, { color: colors.textMuted }]}>{airport.iataCode}</Text> : null}
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: colors.textMuted }]}>{airport.name}</Text>
          {showLocation ? (
            <Text numberOfLines={1} style={[styles.place, { color: colors.textMuted }]}>
              {[airport.municipality, airport.countryCode].filter(Boolean).join(', ')}
            </Text>
          ) : null}
        </View>
        {metar ? <FlightCategoryBadge category={metar.category} /> : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
      </View>
      {showWeather ? (
        metar ? (
          <View style={[styles.weatherRow, { borderTopColor: colors.border }]}> 
            {weatherSource ? (
              <View style={styles.sourceRow}>
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text style={[styles.sourceText, { color: colors.textMuted }]}>Weather from {weatherSource.icao} · {Math.round(weatherSource.distanceKm)} km away</Text>
              </View>
            ) : null}
            <View style={styles.weatherItem}>
              <Ionicons name="navigate-outline" size={15} color={colors.primary} />
              <Text style={[styles.weatherText, { color: colors.text }]}>
                {metar.windDirectionTrue === null ? 'VRB' : `${Math.round(metar.windDirectionTrue)}°`} {formatSpeed(metar.windSpeedKt, preferences.speed)}
              </Text>
            </View>
            <View style={styles.weatherItem}>
              <Ionicons name="eye-outline" size={15} color={colors.primary} />
              <Text style={[styles.weatherText, { color: colors.text }]}>
                {formatVisibility(metar.visibilitySm, preferences.visibility, {
                  qualifier: metar.visibilityQualifier,
                  tenKmOrMore: metar.visibilityIsTenKmOrMore
                })}
              </Text>
            </View>
            {ceiling !== null ? (
              <View style={styles.weatherItem}>
                <Ionicons name="cloud-outline" size={15} color={colors.primary} />
                <Text style={[styles.weatherText, { color: colors.text }]}>{formatAltitude(ceiling, preferences.altitude)}</Text>
              </View>
            ) : null}
            <Text style={[styles.age, { color: weather?.isStale ? colors.warning : colors.textMuted }]}>
              {weather?.isStale ? 'Cached · ' : ''}{observationAge(metar.observedAt)}
            </Text>
          </View>
        ) : (
          weatherLoading ? (
            <View style={[styles.loadingReport, { borderTopColor: colors.border }]}> 
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.noReportText, { color: colors.textMuted }]}>Fetching weather…</Text>
            </View>
          ) : (
            <Text style={[styles.noReport, { color: colors.textMuted, borderTopColor: colors.border }]}>No current METAR</Text>
          )
        )
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 13 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleBlock: { flex: 1 },
  codeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  ident: { fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  iata: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  place: { fontSize: 12, marginTop: 3 },
  weatherRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  sourceRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: -3 },
  sourceText: { fontSize: 10, lineHeight: 15, fontWeight: '700' },
  weatherItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weatherText: { fontSize: 12, fontWeight: '700' },
  age: { fontSize: 11, marginLeft: 'auto' },
  noReport: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, fontSize: 13 },
  loadingReport: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  noReportText: { fontSize: 13 }
});
