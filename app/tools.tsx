import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useAppTheme } from '@/theme/theme';

const entries = [
  { section: 'Planning', items: [
    { title: 'Saved routes', icon: 'navigate-outline', path: '/route-plans' },
    { title: 'Aircraft', icon: 'airplane-outline', path: '/aircraft' },
    { title: 'Mass and Balance', icon: 'scale-outline', path: '/weight-balance' }
  ] },
  { section: 'Records', items: [
    { title: 'Logbook', icon: 'book-outline', path: '/logbook' },
    { title: 'Pilot documents', icon: 'id-card-outline', path: '/documents' }
  ] },
  { section: 'App', items: [
    { title: 'Preferences', icon: 'options-outline', path: '/settings' },
    { title: 'About & data', icon: 'information-circle-outline', path: '/about' }
  ] }
] as const;

export default function MoreScreen(): React.JSX.Element {
  const { colors } = useAppTheme();
  return <Screen>
    {entries.map((group) => <View key={group.section} style={styles.group}><Text style={[styles.groupTitle, { color: colors.textMuted }]}>{group.section.toUpperCase()}</Text><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{group.items.map((item, index) => <Pressable key={item.path} accessibilityRole="button" onPress={() => router.push(item.path)} style={[styles.row, { borderTopWidth: index ? 1 : 0, borderColor: colors.border }]}><Ionicons name={item.icon} size={22} color={colors.primary} /><Text style={[styles.name, { color: colors.text }]}>{item.title}</Text><Ionicons name="chevron-forward" size={19} color={colors.textMuted} /></Pressable>)}</View></View>)}
  </Screen>;
}

const styles = StyleSheet.create({ title: { fontSize: 31, fontWeight: '900', marginBottom: 5 }, group: { gap: 8, marginBottom: 6 }, groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 }, card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 15 }, row: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 14 }, name: { flex: 1, fontSize: 16, fontWeight: '800' } });
