import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import { getPlannedFlights } from '@/data/plannedFlights';
import { getAirport } from '@/data/database';
import { usePreferences } from '@/state/preferences';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/theme';

export default function FlightsScreen(): React.JSX.Element {
  const { colors } = useAppTheme();
  const db = useSQLiteContext();
  const { preferences, updatePreferences } = usePreferences();
  const [homeAirport, setHomeAirport] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const setupHome = async () => {
    try {
      setSettingUp(true);
      const airport = await getAirport(db, homeAirport.trim().toUpperCase());
      if (!airport) { Alert.alert('Airport not found', 'Enter your home airport identifier, or skip setup.'); return; }
      await updatePreferences({ mapStartAirport: airport.weatherCode || airport.ident, onboardingCompleted: true });
    } catch { Alert.alert('Could not save home airport', 'Please try again.'); } finally { setSettingUp(false); }
  };
  const flights = useQuery({ queryKey: ['planned-flights'], queryFn: () => getPlannedFlights(db) });
  const { refetch } = flights;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const [showDrafts, setShowDrafts] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const previous = (flights.data ?? []).filter((flight) => flight.logbookStatus !== 'COMPLETE' && flight.planningStatus === 'READY' && flight.departureDate < today);
  const drafts = (flights.data ?? []).filter((flight) => flight.logbookStatus !== 'COMPLETE' && flight.planningStatus === 'DRAFT');
  const upcoming = (flights.data ?? []).filter((flight) => flight.logbookStatus !== 'COMPLETE' && flight.planningStatus === 'READY' && flight.departureDate >= today).sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`));
  const flightRow = (flight: (typeof drafts)[number], nested = false) => <Pressable key={flight.id} onPress={() => router.push({ pathname: '/flight-plan', params: { id: flight.id } })} style={[styles.link, nested && styles.nestedFlight, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons name="airplane-outline" size={22} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.flightTitle, { color: colors.text }]}>{flight.departureAirport} → {flight.arrivalAirport}</Text><Text style={[styles.sub, { color: colors.textMuted }]}>{flight.departureDate || 'Date not set'}{flight.departureTime ? ` · ${flight.departureTime} UTC` : ''}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>;
  return <Screen>
    <View style={styles.intro}><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR FLIGHTS</Text><Text style={[styles.heading, { color: colors.text }]}>Ready to plan?</Text><Text style={[styles.sub, { color: colors.textMuted }]}>Plan a flight or pick up where you left off.</Text></View>
    {!preferences.onboardingCompleted && preferences.safetyAcknowledged ? <View style={[styles.draftsGroup, { padding: 16, gap: 12, borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.flightTitle, { color: colors.text }]}>Set your home airport</Text><Text style={[styles.sub, { color: colors.textMuted }]}>Quick plan starts here. You can change it in Preferences.</Text>
      <TextInput accessibilityLabel="Home airport ICAO" value={homeAirport} onChangeText={setHomeAirport} autoCapitalize="characters" placeholder="e.g. EDAY" placeholderTextColor={colors.textMuted} style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 12, minHeight: 48, padding: 12 }} />
      <Pressable disabled={settingUp} onPress={() => void setupHome()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{settingUp ? 'Saving…' : 'Use home airport'}</Text></Pressable>
      <Pressable onPress={() => void updatePreferences({ onboardingCompleted: true }).catch(() => Alert.alert('Could not save preference', 'Please try again.'))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.textMuted }}>Skip for now</Text></Pressable>
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Quick plan a flight" onPress={() => router.push('/quick-plan')} style={[styles.hero, { backgroundColor: colors.primary }]}><View style={{ flex: 1 }}><Text style={styles.heroTitle}>Quick plan</Text><Text style={styles.heroSub}>New flight · saved routes</Text></View><Ionicons name="arrow-forward-circle" size={35} color="#FFFFFF" /></Pressable>
    {drafts.length ? <View style={[styles.draftsGroup, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showDrafts }} onPress={() => setShowDrafts(!showDrafts)} style={styles.draftsHeader}><Ionicons name="create-outline" size={22} color={colors.primary} /><Text style={[styles.linkText, { color: colors.text }]}>Continue planning ({drafts.length})</Text><Ionicons name={showDrafts ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} /></Pressable>
      {showDrafts ? <View style={[styles.draftsList, { borderTopColor: colors.border }]}>{drafts.map((flight) => flightRow(flight, true))}</View> : null}
    </View> : null}
    {upcoming.length ? <>
    <Text style={[styles.heading, { color: colors.text, fontSize: 21 }]}>Upcoming flights</Text>
    {upcoming.map((flight) => flightRow(flight))}
    </> : null}
    {previous.length ? <View style={{ gap: 8 }}><Text style={[styles.flightTitle, { color: colors.textMuted }]}>Previous plans</Text>{previous.map((flight) => flightRow(flight))}</View> : null}


  </Screen>;
}

const styles = StyleSheet.create({
  intro: { gap: 5, marginBottom: 3 }, eyebrow: { fontSize: 11, letterSpacing: 1.1, fontWeight: '900' }, heading: { fontSize: 31, fontWeight: '900' }, sub: { fontSize: 14, lineHeight: 20 },
  hero: { minHeight: 112, borderRadius: 21, padding: 20, flexDirection: 'row', alignItems: 'center' }, heroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' }, heroSub: { color: '#E6FAFB', fontSize: 12, marginTop: 7 },
  flightTitle: { fontWeight: '800', fontSize: 15, marginBottom: 5 }, draftsGroup: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' }, draftsHeader: { minHeight: 62, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, draftsList: { borderTopWidth: 1, padding: 10, gap: 8 }, nestedFlight: { borderRadius: 10 },
  shortcuts: { flexDirection: 'row', gap: 10 }, shortcut: { borderWidth: 1, borderRadius: 15, minHeight: 56, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, shortcutText: { fontWeight: '800', fontSize: 13 },
  link: { borderWidth: 1, borderRadius: 16, minHeight: 62, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, linkText: { flex: 1, fontWeight: '800', fontSize: 15 }
});
