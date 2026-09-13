import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getFlightWeatherBriefing, getValidPlannedWeatherBriefing } from '@/data/flightWeather';
import { groupFlightWeatherReports, type FlightWeatherAirportSnapshot } from '@/domain/flightWeather';
import { useAppTheme } from '@/theme/theme';

const generatedTime = (value: number) => new Intl.DateTimeFormat('en', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
}).format(new Date(value));

function AirportReport({ reports }: { reports: FlightWeatherAirportSnapshot[] }): React.JSX.Element {
  const { colors } = useAppTheme();
  const report = reports[0]!;
  const idents = reports.map((airport) => airport.requestedIdent).join(' · ');
  const errors = [...new Set(reports.map((airport) => airport.error).filter(Boolean))];
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.heading}><View style={styles.headingCopy}><Text style={[styles.ident, { color: colors.text }]}>{idents}</Text>{reports.length === 1 && report.airportName ? <Text style={[styles.airportName, { color: colors.textMuted }]}>{report.airportName}</Text> : null}</View>{report.flightCategory ? <View style={[styles.category, { backgroundColor: colors.primarySoft }]}><Text style={[styles.categoryText, { color: colors.primary }]}>{report.flightCategory}</Text></View> : null}</View>
    {report.metarIdent || report.tafIdent ? <Text style={[styles.source, { color: colors.textMuted }]}>{report.metarIdent && report.tafIdent && report.metarIdent === report.tafIdent ? `METAR and TAF from ${report.metarIdent}` : [report.metarIdent ? `METAR from ${report.metarIdent}` : null, report.tafIdent ? `TAF from ${report.tafIdent}` : null].filter(Boolean).join(' · ')}</Text> : null}
    <View style={[styles.report, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.label, { color: colors.textMuted }]}>METAR</Text><Text selectable style={[styles.raw, { color: colors.text }]}>{report.metar ?? 'No METAR was available when this briefing was generated.'}</Text></View>
    <View style={[styles.report, { backgroundColor: colors.surfaceRaised }]}><Text style={[styles.label, { color: colors.textMuted }]}>TAF</Text><Text selectable style={[styles.raw, { color: colors.text }]}>{report.taf ?? 'No TAF was available when this briefing was generated.'}</Text></View>
    {report.observedWeather.length || report.forecastWeather.length ? <View style={styles.conditions}><Ionicons name="rainy-outline" size={18} color={colors.primary} /><View style={styles.headingCopy}><Text style={[styles.conditionsTitle, { color: colors.text }]}>Significant weather codes</Text>{report.observedWeather.length ? <Text style={[styles.conditionsText, { color: colors.textMuted }]}>Observed: {report.observedWeather.join(', ')}</Text> : null}{report.forecastWeather.length ? <Text style={[styles.conditionsText, { color: colors.textMuted }]}>Forecast: {report.forecastWeather.join(', ')}</Text> : null}</View></View> : null}
    <View style={styles.warnings}><Text style={[styles.label, { color: colors.textMuted }]}>DWD WARNINGS</Text>
      {reports.some((airport) => airport.dwdWarnings.length) ? reports.map((airport) => airport.dwdWarnings.length ? <View key={airport.requestedIdent}><Text style={[styles.conditionsTitle, { color: colors.text }]}>{airport.requestedIdent}</Text>{airport.dwdWarnings.map((warning, index) => <View key={`${warning.headline}-${index}`} style={[styles.warning, { borderTopColor: colors.border }]}><Text style={[styles.warningTitle, { color: colors.text }]}>{warning.headline}</Text><Text style={[styles.conditionsText, { color: colors.textMuted }]}>{warning.regionName}{warning.onset || warning.expires ? ` · ${warning.onset ?? 'Now'} to ${warning.expires ?? 'Open-ended'}` : ''}</Text></View>)}</View> : <Text key={airport.requestedIdent} style={[styles.conditionsText, { color: colors.textMuted }]}>{airport.requestedIdent}: No active DWD warning was captured.</Text>) : <Text style={[styles.conditionsText, { color: colors.textMuted }]}>No active DWD warning was captured for these aerodromes. DWD warnings are included only for airports in Germany.</Text>}
    </View>
    {errors.length ? <Text style={[styles.error, { color: colors.warning }]}>Partial data: {errors.join(' · ')}</Text> : null}
  </View>;
}

export default function FlightWeatherScreen(): React.JSX.Element {
  const { id, plannedFlightId } = useLocalSearchParams<{ id?: string; plannedFlightId?: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const briefing = useQuery({ queryKey: [plannedFlightId ? 'planned-weather-view' : 'flight-weather-briefing', plannedFlightId ?? id], queryFn: async () => {
    if (!plannedFlightId) return getFlightWeatherBriefing(db, id!);
    return getValidPlannedWeatherBriefing(db, plannedFlightId);
  }, enabled: Boolean(plannedFlightId || id), staleTime: 0 });
  if (briefing.isLoading) return <Screen scroll={false}><StateNotice loading title="Loading weather briefing" /></Screen>;
  if (!briefing.data) return <Screen scroll={false}><StateNotice title="Weather briefing unavailable" body="This flight does not have a saved weather briefing." /></Screen>;
  return <><Stack.Screen options={{ title: 'Weather briefing' }} /><Screen>
    <View style={[styles.summary, { backgroundColor: colors.primarySoft }]}><Ionicons name="time-outline" size={20} color={colors.primary} /><View style={styles.headingCopy}><Text style={[styles.summaryTitle, { color: colors.text }]}>{briefing.data.departureAirport} → {briefing.data.arrivalAirport}</Text><Text style={[styles.summaryText, { color: colors.textMuted }]}>Snapshot generated {generatedTime(briefing.data.generatedAt)}</Text></View></View>
    {groupFlightWeatherReports(briefing.data.airports).map((reports) => <AirportReport key={reports.map((report) => report.requestedIdent).join('|')} reports={reports} />)}
    <Text style={[styles.disclaimer, { color: colors.textMuted }]}>This saved snapshot may be incomplete or outdated. Verify METARs, TAFs, significant weather, and warnings with an authorized aviation weather source before flight.</Text>
  </Screen></>;
}

const styles = StyleSheet.create({
  summary: { borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  summaryTitle: { fontSize: 16, fontWeight: '900' }, summaryText: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }, headingCopy: { flex: 1 },
  ident: { fontSize: 24, fontWeight: '900' }, airportName: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  category: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, categoryText: { fontSize: 10, fontWeight: '900' },
  source: { fontSize: 10, fontWeight: '700' }, report: { borderRadius: 13, padding: 12, gap: 5 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }, raw: { fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  conditions: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, conditionsTitle: { fontSize: 12, fontWeight: '900' }, conditionsText: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  warnings: { gap: 7 }, warning: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 }, warningTitle: { fontSize: 11, lineHeight: 16, fontWeight: '800' },
  error: { fontSize: 10, lineHeight: 15, fontWeight: '800' }, disclaimer: { fontSize: 10, lineHeight: 15, textAlign: 'center', paddingHorizontal: 8 }
});
