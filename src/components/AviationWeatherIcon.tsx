import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { TafPeriod } from '@/domain/models';
import { tafWeatherIcon } from '@/domain/tafWeatherIcon';
import { useAppTheme } from '@/theme/theme';

export function AviationWeatherIcon({ period, isNight = false }: { period: TafPeriod | null; isNight?: boolean }): React.JSX.Element {
  const { colors } = useAppTheme();
  const icon = tafWeatherIcon(period, isNight);
  const color = icon.tone === 'warning' ? colors.warning : icon.tone === 'muted' ? colors.textMuted : colors.primary;
  return (
    <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
      <Ionicons name={icon.name} size={27} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }
});
