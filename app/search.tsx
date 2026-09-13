import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { AirportListItem } from '@/components/AirportListItem';
import { StateNotice } from '@/components/StateNotice';
import { searchAirports } from '@/data/database';
import { useAppTheme } from '@/theme/theme';

export default function SearchScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setQuery(input), 180);
    return () => clearTimeout(timeout);
  }, [input]);
  const results = useQuery({
    queryKey: ['airport-search', query],
    queryFn: () => searchAirports(db, query)
  });
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          autoFocus
          accessibilityLabel="Airport search"
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ICAO, IATA, airport, or city"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          style={[styles.input, { color: colors.text }]}
        />
        {input ? <Ionicons name="close-circle" size={20} color={colors.textMuted} onPress={() => setInput('')} /> : null}
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{input ? `${results.data?.length ?? 0} results` : 'Popular airports'}</Text>
      <FlatList
        data={results.data ?? []}
        keyExtractor={(airport) => String(airport.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <AirportListItem
            airport={item}
            showWeather={false}
            onPress={() => router.replace({ pathname: '/station/[icao]', params: { icao: item.weatherCode ?? item.ident } })}
          />
        )}
        ListEmptyComponent={results.isLoading
          ? <StateNotice loading title="Searching airports" />
          : <StateNotice icon="search-outline" title="No airports found" body="Try an ICAO code, IATA code, airport name, or nearby city." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8 },
  searchBox: { marginHorizontal: 16, borderWidth: 1, borderRadius: 16, minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 50, fontSize: 16 },
  hint: { marginHorizontal: 18, marginTop: 14, marginBottom: 6, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  list: { padding: 16, gap: 10, paddingBottom: 40 }
});
