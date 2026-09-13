import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AirportCommunications } from '@/components/AirportCommunications';
import { AirportNotams } from '@/components/AirportNotams';
import { DwdWeatherWarnings } from '@/components/DwdWeatherWarnings';
import { ForecastGuidance } from '@/components/ForecastGuidance';
import { RawReport } from '@/components/RawReport';
import { RunwayDiagram } from '@/components/RunwayDiagram';
import { Screen } from '@/components/Screen';
import { SectionTabs } from '@/components/SectionTabs';
import { StateNotice } from '@/components/StateNotice';
import { TafTimeline } from '@/components/TafTimeline';
import { WeatherOverview } from '@/components/WeatherOverview';
import { getAirport, getFrequencies, getNearbyAirports, getRunways, isFavorite, recordRecentAirport, setFavorite } from '@/data/database';
import { fetchDwdWarnings } from '@/data/dwd';
import { fetchGfsGuidance } from '@/data/forecastGuidance';
import { fetchInformationalNotams } from '@/data/notams';
import { DefaultWeatherRepository } from '@/data/weatherRepository';
import { formatAltitude } from '@/domain/units';
import { formatEpoch, sunriseSunset } from '@/domain/time';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

const SECTIONS = ['Overview', 'TAF', 'Airport'] as const;
type Section = typeof SECTIONS[number];

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function SourceNotice({ summary, detail }: { summary: string; detail: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${summary}. ${expanded ? 'Hide' : 'Show'} source details`}
      onPress={() => setExpanded((current) => !current)}
      style={[styles.sourceNotice, { backgroundColor: colors.primarySoft }]}
    >
      <Ionicons name="navigate-outline" size={18} color={colors.primary} />
      <View style={styles.sourceContent}>
        <Text style={[styles.sourceSummary, { color: colors.text }]}>{summary}</Text>
        {expanded ? <Text style={[styles.sourceText, { color: colors.textMuted }]}>{detail}</Text> : null}
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'information-circle-outline'} size={18} color={colors.primary} />
    </Pressable>
  );
}

export default function StationScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ icao: string | string[] }>();
  const rawIdent = Array.isArray(params.icao) ? (params.icao[0] ?? '') : (params.icao ?? '');
  const ident = rawIdent.toUpperCase();
  const db = useSQLiteContext();
  const repository = useMemo(() => new DefaultWeatherRepository(db), [db]);
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>('Overview');

  const airport = useQuery({
    queryKey: ['airport', ident],
    queryFn: () => getAirport(db, ident),
    enabled: ident.length > 0
  });
  const code = airport.data?.weatherCode ?? null;
  const weather = useQuery({
    queryKey: ['weather', code],
    queryFn: () => repository.getWeather(code!),
    enabled: Boolean(code)
  });
  const nearbyWeatherStations = useQuery({
    queryKey: ['nearby-weather-stations', airport.data?.id],
    queryFn: () => getNearbyAirports(db, airport.data!, { radiusKm: 120, limit: 24, weatherStationsOnly: true }),
    enabled: Boolean(airport.data && (!code || (weather.isSuccess && (!weather.data?.metar || !weather.data?.taf))))
  });
  const fallbackCodes = [...new Set((nearbyWeatherStations.data ?? [])
    .map((candidate) => candidate.airport.weatherCode)
    .filter((candidate): candidate is string => Boolean(candidate && candidate !== code)))];
  const fallbackWeather = useQuery({
    queryKey: ['weather', 'nearby-fallback', ident, ...fallbackCodes],
    queryFn: () => repository.getWeatherBatch(fallbackCodes),
    enabled: fallbackCodes.length > 0
  });
  const runways = useQuery({
    queryKey: ['runways', airport.data?.id],
    queryFn: () => getRunways(db, airport.data!.id),
    enabled: Boolean(airport.data)
  });
  const frequencies = useQuery({
    queryKey: ['frequencies', airport.data?.id],
    queryFn: () => getFrequencies(db, airport.data!.id),
    enabled: Boolean(airport.data)
  });
  const dwdWarnings = useQuery({
    queryKey: ['dwd-warnings', airport.data?.latitude, airport.data?.longitude],
    queryFn: () => fetchDwdWarnings(airport.data!.latitude, airport.data!.longitude),
    enabled: airport.data?.countryCode === 'DE',
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
  const forecastGuidance = useQuery({
    queryKey: ['gfs-guidance', airport.data?.latitude, airport.data?.longitude],
    queryFn: () => fetchGfsGuidance(airport.data!.latitude, airport.data!.longitude),
    enabled: Boolean(airport.data),
    staleTime: 30 * 60 * 1000,
    retry: 1
  });
  const notams = useQuery({
    queryKey: ['informational-notams', airport.data?.ident],
    queryFn: () => fetchInformationalNotams(airport.data!.ident),
    enabled: Boolean(airport.data && airport.data.countryCode === 'US' && section === 'Airport'),
    staleTime: 5 * 60 * 1000,
    retry: 1
  });
  const favorite = useQuery({
    queryKey: ['favorite', airport.data?.id],
    queryFn: () => isFavorite(db, airport.data!.id),
    enabled: Boolean(airport.data)
  });
  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!airport.data) return;
      await setFavorite(db, airport.data.id, !favorite.data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favorites'] }),
        queryClient.invalidateQueries({ queryKey: ['favorite', airport.data?.id] })
      ]);
    }
  });

  useEffect(() => {
    if (airport.data) {
      void recordRecentAirport(db, airport.data.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ['recent-airport'] }));
    }
  }, [airport.data, db, queryClient]);

  const refresh = async () => {
    if (code) await repository.getWeather(code, true);
    if (fallbackCodes.length > 0) await repository.getWeatherBatch(fallbackCodes, true);
    await Promise.all([
      code ? weather.refetch() : Promise.resolve(),
      fallbackCodes.length > 0 ? fallbackWeather.refetch() : Promise.resolve(),
      airport.data?.countryCode === 'DE' ? dwdWarnings.refetch() : Promise.resolve(),
      airport.data ? forecastGuidance.refetch() : Promise.resolve(),
      airport.data?.countryCode === 'US' && section === 'Airport' ? notams.refetch() : Promise.resolve()
    ]);
  };

  if (airport.isLoading) return <Screen scroll={false}><StateNotice loading title="Loading airport" /></Screen>;
  if (airport.isError || !airport.data) {
    return <Screen scroll={false}><StateNotice title="Airport not found" body="This airport is not present in the bundled database." /></Screen>;
  }

  const selectedAirport = airport.data;
  const fallbackMetarCandidate = (nearbyWeatherStations.data ?? []).find((candidate) => {
    const candidateCode = candidate.airport.weatherCode;
    return candidateCode ? Boolean(fallbackWeather.data?.[candidateCode]?.metar) : false;
  });
  const fallbackTafCandidate = (nearbyWeatherStations.data ?? []).find((candidate) => {
    const candidateCode = candidate.airport.weatherCode;
    return candidateCode ? Boolean(fallbackWeather.data?.[candidateCode]?.taf) : false;
  });
  const fallbackMetarCode = fallbackMetarCandidate?.airport.weatherCode ?? null;
  const fallbackTafCode = fallbackTafCandidate?.airport.weatherCode ?? null;
  const metar = weather.data?.metar ?? (fallbackMetarCode ? fallbackWeather.data?.[fallbackMetarCode]?.metar : null) ?? null;
  const taf = weather.data?.taf ?? (fallbackTafCode ? fallbackWeather.data?.[fallbackTafCode]?.taf : null) ?? null;
  const metarIsNearby = !weather.data?.metar && Boolean(metar && fallbackMetarCandidate);
  const tafIsNearby = !weather.data?.taf && Boolean(taf && fallbackTafCandidate);
  const solar = sunriseSunset(selectedAirport);
  const renderSection = () => {
    if (section === 'Overview') {
      if (!metar && (weather.isLoading || nearbyWeatherStations.isLoading || fallbackWeather.isLoading)) {
        return <StateNotice loading title="Fetching latest weather" />;
      }
      if (!metar) return <StateNotice title="No current or nearby METAR" body={t('noReport')} icon="partly-sunny-outline" />;
      return (
        <>
          {metarIsNearby && fallbackMetarCandidate ? (
            <SourceNotice
              summary={`METAR: ${metar.icao} · ${Math.round(fallbackMetarCandidate.distanceKm)} km away`}
              detail={`This airport does not publish a METAR. The report comes from ${fallbackMetarCandidate.airport.name}.`}
            />
          ) : null}
          <WeatherOverview metar={metar} />
          <RawReport label={`${metar.reportType} ${metar.icao}`} report={metar.raw} />
          {selectedAirport.countryCode === 'DE' ? (
            <DwdWeatherWarnings
              warnings={dwdWarnings.data ?? []}
              loading={dwdWarnings.isLoading}
              error={dwdWarnings.isError}
            />
          ) : null}
        </>
      );
    }
    if (section === 'TAF') {
      return (
        <>
          {taf ? (
            <>
              {tafIsNearby && fallbackTafCandidate ? (
                <SourceNotice
                  summary={`TAF: ${taf.icao} · ${Math.round(fallbackTafCandidate.distanceKm)} km away`}
                  detail={`No local TAF is issued. The forecast comes from ${fallbackTafCandidate.airport.name}.`}
                />
              ) : null}
              <TafTimeline forecast={taf} airport={selectedAirport} nowMs={Math.max(weather.dataUpdatedAt, fallbackWeather.dataUpdatedAt, airport.dataUpdatedAt)} />
              <RawReport label={`TAF ${taf.icao}`} report={taf.raw} />
            </>
          ) : <StateNotice title="No TAF available" body="Not every airport issues a terminal forecast." icon="calendar-outline" />}
          <ForecastGuidance
            guidance={forecastGuidance.data}
            airport={selectedAirport}
            loading={forecastGuidance.isLoading}
            error={forecastGuidance.isError}
          />
        </>
      );
    }
    return (
      <>
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Airport information</Text>
          <InfoRow label="Identifier" value={selectedAirport.ident} />
          <InfoRow label="IATA" value={selectedAirport.iataCode ?? 'Not available'} />
          <InfoRow label="Type" value={selectedAirport.type.replaceAll('_', ' ')} />
          <InfoRow label="Elevation" value={formatAltitude(selectedAirport.elevationFt, preferences.altitude)} />
          <InfoRow label="Coordinates" value={`${selectedAirport.latitude.toFixed(4)}, ${selectedAirport.longitude.toFixed(4)}`} />
          <InfoRow label="Sunrise" value={formatEpoch(Math.floor(solar.sunrise.getTime() / 1000), selectedAirport, preferences.time, { hour: '2-digit', minute: '2-digit' })} />
          <InfoRow label="Sunset" value={formatEpoch(Math.floor(solar.sunset.getTime() / 1000), selectedAirport, preferences.time, { hour: '2-digit', minute: '2-digit' })} />
        </View>
        <RunwayDiagram runways={runways.data ?? []} metar={metar} />
        <AirportNotams
          icao={selectedAirport.ident}
          countryCode={selectedAirport.countryCode}
          result={notams.data}
          loading={notams.isLoading}
          error={notams.isError}
        />
        <AirportCommunications airport={selectedAirport} frequencies={frequencies.data ?? []} />
      </>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: selectedAirport.weatherCode ?? selectedAirport.ident,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={favorite.data ? 'Remove from favorites' : 'Add to favorites'}
              hitSlop={12}
              disabled={toggleFavorite.isPending}
              onPress={() => toggleFavorite.mutate()}
            >
              <Ionicons name={favorite.data ? 'star' : 'star-outline'} color={favorite.data ? '#E7A526' : colors.text} size={25} />
            </Pressable>
          )
        }}
      />
      <Screen
        refreshControl={<RefreshControl refreshing={weather.isRefetching || fallbackWeather.isRefetching || dwdWarnings.isRefetching || forecastGuidance.isRefetching || notams.isRefetching} onRefresh={() => void refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroText}>
              <Text style={[styles.name, { color: colors.textMuted }]}>{selectedAirport.name}</Text>
              <Text style={[styles.place, { color: colors.textMuted }]}>{[selectedAirport.municipality, selectedAirport.countryCode].filter(Boolean).join(', ')}</Text>
            </View>
            <View style={styles.reportMeta}>
              {metar ? (
                <Text style={[styles.updated, { color: colors.textMuted }]}>
                  {formatEpoch(metar.observedAt, selectedAirport, preferences.time, { month: undefined, day: undefined, hour: '2-digit', minute: '2-digit' })} {preferences.time === 'utc' ? 'UTC' : 'local'}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        {weather.data?.isStale || weather.data?.refreshError ? (
          <View style={[styles.warning, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="warning-outline" size={19} color={colors.warning} />
            <Text style={[styles.warningText, { color: colors.text }]}>Cached or partial data is shown. {weather.data.refreshError}</Text>
          </View>
        ) : null}
        {weather.isError && !weather.data && code ? (
          <StateNotice title="Weather unavailable" body={weather.error instanceof Error ? weather.error.message : 'Try again shortly.'} actionLabel={t('tryAgain')} onAction={() => void weather.refetch()} />
        ) : null}
        {!code ? (
          <View style={[styles.warning, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
            <Text style={[styles.warningText, { color: colors.text }]}>This airport has no ICAO weather station identifier. Airport and runway information is still available.</Text>
          </View>
        ) : null}
        <SectionTabs items={SECTIONS} selected={section} onSelect={setSection} />
        <View style={styles.section}>{renderSection()}</View>
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Informational use only · Verify against an authorized source before flight.</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  heroText: { flex: 1 },
  name: { fontSize: 19, fontWeight: '800' },
  place: { fontSize: 13, marginTop: 3 },
  reportMeta: { alignItems: 'flex-end', justifyContent: 'center' },
  updated: { fontSize: 11, fontWeight: '700' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, padding: 13 },
  warningText: { flex: 1, fontSize: 13, lineHeight: 18 },
  sourceNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, padding: 11 },
  sourceContent: { flex: 1, gap: 3 },
  sourceSummary: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  sourceText: { fontSize: 11, lineHeight: 16 },
  section: { gap: 14 },
  infoCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  cardTitle: { fontSize: 20, fontWeight: '900', marginBottom: 6 },
  infoRow: { minHeight: 49, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  infoLabel: { fontSize: 13, fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'right', textTransform: 'capitalize' },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 }
});
