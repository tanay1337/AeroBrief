import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { deleteRoutePlan, getRoutePlans } from '@/data/routePlans';
import { calculateRoute, formatRouteDuration } from '@/domain/routePlanning';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

export default function RoutePlansScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const { preferences, updatePreferences } = usePreferences();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const plans = useQuery({ queryKey: ['route-plans'], queryFn: () => getRoutePlans(db) });
  useFocusEffect(useCallback(() => { void queryClient.invalidateQueries({ queryKey: ['route-plans'] }); }, [queryClient]));

  const remove = (id: string, title: string) => Alert.alert('Delete route?', title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void deleteRoutePlan(db, id).then(async () => {
      if (preferences.lastMapRouteId === id) await updatePreferences({ lastMapRouteId: '' });
      queryClient.removeQueries({ queryKey: ['route-plan', id], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['route-plans'] });
      await queryClient.invalidateQueries({ queryKey: ['route-plan-view'] });
    }).catch((error) => Alert.alert('Cannot delete route', error instanceof Error ? error.message : 'Try again.')) }
  ]);

  return (
    <>
      <Stack.Screen options={{ title: 'Saved routes', }} />
      <Screen>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/route-planner')} style={[styles.card, { borderColor: colors.border }]}><Text style={{ color: colors.primary, fontWeight: '800' }}>Plan a new route</Text></Pressable>
        {plans.isLoading ? <StateNotice loading title="Loading routes" /> : plans.isError ? <StateNotice title="Routes unavailable" body="The route database could not be opened." /> : !(plans.data?.length) ? <StateNotice icon="map-outline" title="No saved routes" body="Build a route on the OpenFlightMaps chart. Changes save automatically." actionLabel="Plan a route" onAction={() => router.replace('/route-planner')} /> : plans.data.map((plan) => {
          const summary = calculateRoute(plan.waypoints, plan.cruiseSpeedKt, plan.fuelBurnPerHour, plan.windDirectionTrue, plan.windSpeedKt);
          const route = plan.waypoints.map((point) => point.ident).join(' → ');
          return <Pressable key={plan.id} onPress={() => router.push({ pathname: '/route-plan-view', params: { id: plan.id } })} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}> 
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="navigate-outline" size={22} color={colors.primary} /></View>
            <View style={styles.copy}><Text style={[styles.title, { color: colors.text }]}>{plan.title}</Text><Text numberOfLines={1} style={[styles.route, { color: colors.textMuted }]}>{route}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>{summary.distanceNm.toFixed(1)} NM · {formatRouteDuration(summary.estimatedMinutes)} EET · AIRAC {plan.airacCycle}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${plan.title}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); remove(plan.id, plan.title); }}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable>
          </Pressable>;
        })}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, title: { fontSize: 16, fontWeight: '900' }, route: { fontSize: 12, fontWeight: '700', marginTop: 3 }, meta: { fontSize: 10, fontWeight: '700', marginTop: 6 }
});
