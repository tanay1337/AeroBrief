import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { getAircraftProfile } from '@/data/aircraftProfiles';
import { checkRouteFuel } from '@/domain/routeFuelCheck';
import type { RoutePlan } from '@/domain/routePlanning';
import type { SavedWeightBalanceCalculation } from '@/domain/weightBalance';
import { useAppTheme } from '@/theme/theme';

export function RouteFuelCheckCard({ route, calculation, flight }: { route: RoutePlan; calculation: SavedWeightBalanceCalculation; flight: { callsign: string; date: string; departureAirport: string; arrivalAirport: string } }): React.JSX.Element | null {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const profile = useQuery({ queryKey: ['aircraft-profile', calculation.profileId], queryFn: () => getAircraftProfile(db, calculation.profileId) });
  const check = profile.data ? checkRouteFuel(route, calculation, profile.data, flight) : null;
  if (check?.status !== 'shortfall') return null;
  const detail = [
    check.message,
    check.required !== undefined ? `On board ${check.onboard!.toFixed(1)} · Required ${check.required.toFixed(1)} · Shortfall ${Math.abs(check.margin!).toFixed(1)} ${check.unit}` : null,
    check.required !== undefined ? `Trip ${check.trip!.toFixed(1)} + taxi ${check.taxi!.toFixed(1)} + contingency ${check.contingency!.toFixed(1)} + reserve ${check.reserve!.toFixed(1)} (${check.reserveMinutes} min) + extra ${check.extra!.toFixed(1)} ${check.unit}` : null,
    ...(check?.notes ?? []),
  ].filter(Boolean).join('\n\n');
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surfaceRaised }}>
    <Ionicons name="warning" size={17} color={colors.danger} />
    <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: colors.danger }}>Fuel may be too low for this route</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Route fuel check details" hitSlop={10} onPress={() => Alert.alert('Route fuel check', detail)}>
      <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
    </Pressable>
  </View>;
}
