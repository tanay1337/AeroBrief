import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';
import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/components/AppIcon';
import { Screen } from '@/components/Screen';
import { getDataSourceDate } from '@/data/database';
import { useAppTheme } from '@/theme/theme';

function LinkCard({ title, body, url }: { title: string; body: string; url: string }): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Text style={[styles.cardTitle, { color: colors.primary }]}>{title}</Text>
      <Text style={[styles.cardBody, { color: colors.textMuted }]}>{body}</Text>
    </Pressable>
  );
}

export default function AboutScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const sourceDate = useQuery({ queryKey: ['source-date'], queryFn: () => getDataSourceDate(db) });
  const appConfig = require('../app.json').expo as { version: string; android: { versionCode: number }; ios: { buildNumber: string } };
  const version = appConfig.version;
  const build = Platform.OS === 'ios' ? appConfig.ios.buildNumber : appConfig.android.versionCode;
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.mark}><AppIcon /></View>
        <Text style={[styles.title, { color: colors.text }]}>AeroBrief</Text>
        <Text style={[styles.version, { color: colors.textMuted }]}>Version {version}{build ? ` (${build})` : ''}</Text>
      </View>
      <View style={[styles.warning, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={[styles.warningTitle, { color: colors.text }]}>Informational use only</Text>
        <Text style={[styles.warningBody, { color: colors.textMuted }]}>Weather and airport data may be delayed, incomplete, or inaccurate. AeroBrief is not certified for flight planning or navigation. Always obtain an authorized briefing and verify critical information using official sources.</Text>
      </View>
      <LinkCard title="NOAA Aviation Weather Center" body="Worldwide METAR and TAF reports. Refresh frequency and availability are controlled by NOAA." url="https://aviationweather.gov/data/api/" />
      <LinkCard title="DWD Open Data" body="Official general weather warnings for German airports. These supplement aviation weather and may be delayed or temporarily unavailable." url="https://www.dwd.de/EN/ourservices/opendata/opendata.html" />
      <LinkCard title="Forecast model guidance" body="NOAA GFS point forecast and pressure-level wind data supplied through Open-Meteo. This is model output, not an observation or authorized briefing." url="https://open-meteo.com/en/docs/gfs-api" />
      <LinkCard title="OpenFlightMaps" body="Online VFR base and aeronautical chart tiles. Coverage, chart detail, and AIRAC publication are controlled by the open flightmaps association." url="https://openflightmaps.org/" />
      <LinkCard title="Esri World Imagery" body="Optional online satellite imagery basemap. Imagery dates, resolution, coverage, and availability vary by location and data provider." url="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9" />
      <LinkCard title="DFS AIS & AIP" body="Official German aeronautical publications, charts and route/time-specific NOTAM briefing tools." url="https://ais.dfs.de/" />
      <LinkCard title="OurAirports" body={`Public-domain airport, runway, and frequency reference data${sourceDate.data ? ` · bundled ${sourceDate.data}` : ''}. It is provided without a guarantee of accuracy or fitness.`} url="https://ourairports.com/data/" />
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Privacy</Text>
        <Text style={[styles.cardBody, { color: colors.textMuted }]}>AeroBrief has no account, analytics, advertisements, or location access. Favorites, settings, routes, and cached reports remain on your device. Weather and map requests necessarily expose your network address to NOAA, DWD, Open-Meteo, OpenFlightMaps, or Esri.</Text>
      </View>
      <Text style={[styles.footer, { color: colors.textMuted }]}>Original software inspired by the need for clearer aviation information. Not affiliated with OpenFlightMaps, NOAA, or OurAirports.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 12 },
  mark: { width: 76, height: 76, borderRadius: 22 },
  title: { fontSize: 28, fontWeight: '900', marginTop: 12 },
  version: { fontSize: 13, marginTop: 3 },
  warning: { borderRadius: 18, padding: 17 },
  warningTitle: { fontSize: 17, fontWeight: '900' },
  warningBody: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 18, padding: 17 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardBody: { fontSize: 13, lineHeight: 20, marginTop: 5 },
  footer: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 }
});
