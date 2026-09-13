import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LogbookFlight } from '@/domain/logbook';
import { formatMinutes } from '@/domain/logbook';
import { useAppTheme } from '@/theme/theme';

type Metric = 'airtimeMinutes' | 'flightTimeMinutes' | 'landingsTotal';

interface Props {
  title: string;
  flights: LogbookFlight[];
  metric: Metric;
}

const sum = (flights: LogbookFlight[], metric: Metric): number => flights.reduce((total, flight) => total + flight[metric], 0);

export function LogbookSummaryCard({ title, flights, metric }: Props): React.JSX.Element {
  const { colors } = useAppTheme();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const registrations = [...new Set(flights.map((flight) => flight.callsign).filter(Boolean))].sort();
  const format = (value: number) => metric === 'landingsTotal' ? String(value) : formatMinutes(value);
  const subsets = (items: LogbookFlight[]) => [
    items,
    items.filter((flight) => new Date(`${flight.date}T12:00:00Z`) >= cutoff),
    items.filter((flight) => Number(flight.date.slice(0, 4)) === year)
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Aircraft</Text>
        <Text style={[styles.heading, { color: colors.textMuted }]}>Total</Text>
        <Text style={[styles.heading, { color: colors.textMuted }]}>90 days</Text>
        <Text style={[styles.heading, { color: colors.textMuted }]}>{year}</Text>
      </View>
      {registrations.map((registration) => {
        const values = subsets(flights.filter((flight) => flight.callsign === registration)).map((items) => sum(items, metric));
        return (
          <View key={registration} style={[styles.row, styles.dataRow, { borderTopColor: colors.border }]}>
            <Text numberOfLines={1} style={[styles.label, { color: colors.text }]}>{registration}</Text>
            {values.map((value, index) => <Text key={index} style={[styles.value, { color: colors.text }]}>{format(value)}</Text>)}
          </View>
        );
      })}
      <View style={[styles.row, styles.dataRow, { borderTopColor: colors.primary }]}>
        <Text style={[styles.total, { color: colors.text }]}>Total</Text>
        {subsets(flights).map((items, index) => <Text key={index} style={[styles.total, { color: colors.text }]}>{format(sum(items, metric))}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16 },
  title: { fontSize: 23, fontWeight: '900', letterSpacing: -0.4, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  dataRow: { minHeight: 46, borderTopWidth: StyleSheet.hairlineWidth },
  label: { flex: 1.25, fontSize: 13, fontWeight: '700' },
  heading: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  value: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  total: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '900' }
});
