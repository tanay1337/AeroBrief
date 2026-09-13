import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getDfsChartLinks } from '@/data/dfsCharts';
import type { Airport, AirportFrequency } from '@/domain/models';
import { openInAppBrowser } from '@/navigation/inAppBrowser';
import { useAppTheme } from '@/theme/theme';

const DFS_AIP_URL = 'https://aip.dfs.de/basicAIP/';

function OfficialLink({
  icon,
  title,
  body,
  url
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  url: string;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openInAppBrowser(url, title)}
      style={[styles.linkCard, { backgroundColor: colors.surfaceRaised }]}
    >
      <Ionicons name={icon} size={21} color={colors.primary} />
      <View style={styles.linkText}>
        <Text style={[styles.linkTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.linkBody, { color: colors.textMuted }]}>{body}</Text>
      </View>
      <Ionicons name="open-outline" size={17} color={colors.primary} />
    </Pressable>
  );
}

export function AirportCommunications({
  airport,
  frequencies
}: {
  airport: Airport;
  frequencies: AirportFrequency[];
}): React.JSX.Element {
  const { colors } = useAppTheme();
  const isGermany = airport.countryCode === 'DE';
  const briefingCode = airport.ident;
  const chartLinks = getDfsChartLinks(briefingCode);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.eyebrow, { color: colors.textMuted }]}>COMMUNICATIONS & BRIEFING</Text>
      <Text style={[styles.title, { color: colors.text }]}>Pilot information</Text>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Published frequencies</Text>
      {frequencies.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No frequency records are available in the bundled airport dataset. Check the current AIP.</Text>
      ) : frequencies.map((frequency) => (
        <View key={frequency.id} style={[styles.frequencyRow, { borderBottomColor: colors.border }]}>
          <View style={styles.frequencyName}>
            <Text style={[styles.frequencyType, { color: colors.text }]}>{frequency.type}</Text>
            {frequency.description ? <Text numberOfLines={2} style={[styles.frequencyDescription, { color: colors.textMuted }]}>{frequency.description}</Text> : null}
          </View>
          <Text selectable style={[styles.frequencyValue, { color: colors.primary }]}>{frequency.frequencyMhz.toFixed(3)} MHz</Text>
        </View>
      ))}
      <Text style={[styles.datasetNote, { color: colors.textMuted }]}>Frequency records are convenient reference data, not an operational source. Verify them before use.</Text>

      {isGermany ? (
        <View style={styles.links}>
          <View style={[styles.briefingCode, { borderColor: colors.border }]}> 
            <Text style={[styles.briefingCodeLabel, { color: colors.textMuted }]}>OFFICIAL DFS CHARTS</Text>
            <Text selectable style={[styles.briefingCodeValue, { color: colors.text }]}>{briefingCode}</Text>
          </View>
          {chartLinks.vfr ? <OfficialLink icon="map-outline" title={`VFR airport charts for ${briefingCode}`} body="Direct DFS permanent link to this aerodrome's current VFR chart chapter." url={chartLinks.vfr} /> : null}
          {chartLinks.ifr ? <OfficialLink icon="navigate-outline" title={`IFR & approach charts for ${briefingCode}`} body="Direct DFS permanent link to this aerodrome's current IFR and approach chart chapter." url={chartLinks.ifr} /> : null}
          {!chartLinks.vfr && !chartLinks.ifr ? <OfficialLink icon="map-outline" title="Open official DFS AIP" body="No airport-specific permanent chapter was found in the current catalogue." url={DFS_AIP_URL} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 11 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  title: { fontSize: 20, fontWeight: '900', marginTop: -7 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  frequencyRow: { minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  frequencyName: { flex: 1 },
  frequencyType: { fontSize: 13, fontWeight: '800' },
  frequencyDescription: { fontSize: 11, lineHeight: 15, marginTop: 1 },
  frequencyValue: { fontSize: 13, fontWeight: '900' },
  empty: { fontSize: 12, lineHeight: 18 },
  datasetNote: { fontSize: 10, lineHeight: 15 },
  links: { gap: 9, marginTop: 3 },
  briefingCode: { borderWidth: 1, borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  briefingCodeLabel: { flex: 1, fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.6 },
  briefingCodeValue: { fontSize: 17, fontWeight: '900', letterSpacing: 0.8 },
  linkCard: { borderRadius: 13, padding: 12, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { flex: 1 },
  linkTitle: { fontSize: 13, fontWeight: '800' },
  linkBody: { fontSize: 11, lineHeight: 16, marginTop: 2 }
});
