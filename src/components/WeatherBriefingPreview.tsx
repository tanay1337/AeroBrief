import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { FlightWeatherBriefing } from '@/domain/flightWeather';
import { useAppTheme } from '@/theme/theme';
export function WeatherBriefingPreview({ briefing, visible, onClose }: { briefing: FlightWeatherBriefing | null | undefined; visible: boolean; onClose: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, padding: 20, backgroundColor: '#0009', justifyContent: 'center' }}><View style={{ maxHeight: '85%', borderRadius: 18, padding: 18, backgroundColor: colors.surface }}><Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Weather briefing</Text><ScrollView contentContainerStyle={{ gap: 16, paddingVertical: 16 }}>{briefing ? <Text style={{ color: colors.textMuted }}>Captured {new Date(briefing.generatedAt).toLocaleString()}. Check report times before departure.</Text> : null}{briefing?.airports.map((airport) => <View key={airport.requestedIdent} style={{ gap: 8 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{airport.requestedIdent} · {airport.airportName}</Text><Text selectable style={{ color: colors.text }}>METAR {airport.metarIdent ?? ''}
{airport.metar ?? 'Unavailable'}</Text><Text selectable style={{ color: colors.text }}>TAF {airport.tafIdent ?? ''}
{airport.taf ?? 'Unavailable'}</Text>{airport.dwdWarnings.map((warning, index) => <Text key={index} style={{ color: colors.warning }}>{warning.headline}</Text>)}{airport.error ? <Text style={{ color: colors.warning }}>{airport.error}</Text> : null}</View>)}</ScrollView><Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '800' }}>Done</Text></Pressable></View></View></Modal>;
}
