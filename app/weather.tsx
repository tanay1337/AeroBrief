import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AirportListItem } from '@/components/AirportListItem';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getFavorites, getMostRecentAirport, getNearbyAirports } from '@/data/database';
import { DefaultWeatherRepository } from '@/data/weatherRepository';
import type { WeatherBundle } from '@/domain/models';
import { useAppTheme } from '@/theme/theme';

export default function FavoritesScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const repository = useMemo(() => new DefaultWeatherRepository(db), [db]);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => getFavorites(db) });
  const recentAirport = useQuery({
    queryKey: ['recent-airport'],
    queryFn: () => getMostRecentAirport(db),
    enabled: favorites.data?.length === 0
  });
  const nearbyAirports = useQuery({
    queryKey: ['nearby-airports', recentAirport.data?.id],
    queryFn: () => getNearbyAirports(db, recentAirport.data!, { radiusKm: 80, limit: 5 }),
    enabled: Boolean(favorites.data?.length === 0 && recentAirport.data)
  });
  const codes = (favorites.data ?? []).map((airport) => airport.weatherCode).filter((code): code is string => Boolean(code));
  const weather = useQuery({
    queryKey: ['weather', 'favorites', ...codes],
    queryFn: () => repository.getWeatherBatch(codes),
    enabled: codes.length > 0
  });
  const missingWeatherFavorites = (favorites.data ?? []).filter((airport) => {
    const direct = airport.weatherCode ? weather.data?.[airport.weatherCode]?.metar : null;
    return !direct;
  });
  const fallbackWeather = useQuery({
    queryKey: ['weather', 'favorite-fallbacks', ...missingWeatherFavorites.map((airport) => airport.id)],
    queryFn: async () => {
      const candidatesByAirport = await Promise.all(missingWeatherFavorites.map(async (favoriteAirport) => ({
        airportId: favoriteAirport.id,
        candidates: await getNearbyAirports(db, favoriteAirport, {
          radiusKm: 120,
          limit: 24,
          weatherStationsOnly: true
        })
      })));
      const candidateCodes = [...new Set(candidatesByAirport.flatMap(({ candidates }) => candidates
        .map((candidate) => candidate.airport.weatherCode)
        .filter((candidate): candidate is string => Boolean(candidate))))].slice(0, 50);
      const bundles = await repository.getWeatherBatch(candidateCodes);
      return Object.fromEntries(candidatesByAirport.map(({ airportId, candidates }) => {
        const source = candidates.find((candidate) => {
          const candidateCode = candidate.airport.weatherCode;
          return candidateCode ? Boolean(bundles[candidateCode]?.metar) : false;
        });
        const sourceCode = source?.airport.weatherCode ?? null;
        return [airportId, source && sourceCode ? {
          weather: bundles[sourceCode] as WeatherBundle,
          source: { icao: sourceCode, distanceKm: source.distanceKm }
        } : null];
      }));
    },
    enabled: favorites.isSuccess && (codes.length === 0 || weather.isSuccess) && missingWeatherFavorites.length > 0
  });
  const refreshing = favorites.isRefetching || weather.isRefetching || fallbackWeather.isRefetching;

  const refresh = async () => {
    await favorites.refetch();
    if (codes.length > 0) await repository.getWeatherBatch(codes, true).then(() => weather.refetch());
    if (missingWeatherFavorites.length > 0) await fallbackWeather.refetch();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Search airports" hitSlop={10} onPress={() => router.push('/search')}>
                <Ionicons name="search" size={23} color={colors.text} />
              </Pressable>
            </View>
          )
        }}
      />
      <Screen
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <View style={styles.intro}>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Search aerodromes or check weather at your favorites.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Search airports" onPress={() => router.push('/search')} style={[styles.banner, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.primary} /><Text style={[styles.bannerText, { color: colors.text }]}>Search ICAO, name, or city</Text><Ionicons name="arrow-forward" size={17} color={colors.primary} /></Pressable>
        {favorites.isLoading ? (
          <StateNotice loading title="Loading airports" />
        ) : favorites.isError ? (
          <StateNotice title="Favorites unavailable" body="The local airport database could not be opened." actionLabel={t('tryAgain')} onAction={() => void favorites.refetch()} />
        ) : favorites.data?.length === 0 ? (
          <View style={styles.emptyState}>
            <StateNotice
              icon="airplane-outline"
              title={t('noFavorites')}
              body={recentAirport.data ? `${t('noFavoritesBody')} Here are airports near your last-viewed airport.` : t('noFavoritesBody')}
              actionLabel={t('search')}
              onAction={() => router.push('/search')}
            />
            {recentAirport.data && (nearbyAirports.data?.length ?? 0) > 0 ? (
              <View style={styles.nearbySection}>
                <View style={styles.nearbyHeading}>
                  <Ionicons name="navigate-outline" size={18} color={colors.primary} />
                  <Text style={[styles.nearbyTitle, { color: colors.text }]}>Near {recentAirport.data.weatherCode ?? recentAirport.data.ident}</Text>
                </View>
                {nearbyAirports.data?.map(({ airport, distanceKm }) => (
                  <View key={airport.id}>
                    <AirportListItem
                      airport={airport}
                      showWeather={false}
                      showLocation={false}
                      onPress={() => router.push({ pathname: '/station/[icao]', params: { icao: airport.weatherCode ?? airport.ident } })}
                    />
                    <Text style={[styles.distance, { color: colors.textMuted }]}>{Math.round(distanceKm)} km away</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          favorites.data?.map((airport) => {
            const directWeather = airport.weatherCode ? weather.data?.[airport.weatherCode] : undefined;
            const fallback = fallbackWeather.data?.[airport.id];
            return (
              <AirportListItem
                key={airport.id}
                airport={airport}
                showLocation={false}
                weather={directWeather?.metar ? directWeather : fallback?.weather}
                weatherLoading={weather.isLoading || (!directWeather?.metar && fallbackWeather.isLoading)}
                weatherSource={directWeather?.metar ? undefined : fallback?.source}
                onPress={() => router.push({ pathname: '/station/[icao]', params: { icao: airport.weatherCode ?? airport.ident } })}
              />
            );
          })
        )}
        {weather.isError || fallbackWeather.isError ? (
          <View style={[styles.banner, { backgroundColor: colors.surfaceRaised }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.text }]}>Live weather is unavailable. Cached reports are shown when possible.</Text>
          </View>
        ) : null}
        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>Informational use only · Verify with an authorized aviation weather source.</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  intro: { marginBottom: 6 },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginTop: 3 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 5, maxWidth: 520 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 14, padding: 13 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  emptyState: { gap: 18 },
  nearbySection: { gap: 9 },
  nearbyHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  nearbyTitle: { fontSize: 17, fontWeight: '900' },
  distance: { fontSize: 10, fontWeight: '700', textAlign: 'right', marginTop: -8, marginRight: 12 },
  disclaimer: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 }
});
