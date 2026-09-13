import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FlightCategory } from '@/domain/models';
import { categoryColors } from '@/theme/theme';

export function FlightCategoryBadge({
  category,
  centered = false
}: {
  category: FlightCategory;
  centered?: boolean;
}): React.JSX.Element {
  const palette = categoryColors[category];
  return (
    <View
      accessibilityLabel={`Flight category ${category}`}
      style={[styles.badge, centered ? styles.centered : null, { backgroundColor: palette.background }]}
    >
      <Text style={[styles.text, { color: palette.foreground }]}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  centered: { alignSelf: 'center' },
  text: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }
});
