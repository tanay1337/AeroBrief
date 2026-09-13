import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

const tabs = [
  { label: 'Flights', path: '/', icon: 'airplane-outline' },
  { label: 'Map', path: '/route-planner', icon: 'map-outline' },
  { label: 'Airports', path: '/weather', icon: 'location-outline' },
  { label: 'More', path: '/tools', icon: 'grid-outline' }
] as const;

export function BottomTabs(): React.JSX.Element | null {
  const { preferences } = usePreferences();
  const pathname = usePathname();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const activePath = ['/quick-plan', '/flight-plan'].includes(pathname) ? '/'
    : ['/route-plan-view', '/route-plans'].includes(pathname) ? '/route-planner'
      : pathname;
  if (!tabs.some((tab) => tab.path === activePath)) return null;
  return <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
    {tabs.map((tab) => {
      const selected = activePath === tab.path;
      return <Pressable key={tab.path} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${tab.label} tab`} onPress={() => { if (pathname !== tab.path) router.replace(tab.path === '/route-planner' && preferences.lastMapRouteId ? { pathname: '/route-planner', params: { id: preferences.lastMapRouteId } } : tab.path); }} style={styles.tab}>
        <Ionicons name={tab.icon} size={23} color={selected ? colors.primary : colors.textMuted} />
        <Text style={[styles.label, { color: selected ? colors.primary : colors.textMuted }]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8 },
  tab: { flex: 1, minHeight: 47, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, fontWeight: '800' }
});
