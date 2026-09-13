import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/theme';

export function SectionTabs<T extends string>({
  items,
  selected,
  onSelect
}: {
  items: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => {
        const active = item === selected;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item)}
            style={[styles.tab, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}
          >
            <Text style={[styles.text, { color: active ? '#FFFFFF' : colors.text }]}>{item}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2, minWidth: '100%' },
  tab: { flexGrow: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 16, borderWidth: 1 },
  text: { fontSize: 14, fontWeight: '700' }
});
