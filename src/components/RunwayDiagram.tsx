import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { MetarObservation, Runway } from '@/domain/models';
import { calculateRunwayWind } from '@/domain/weather';
import { formatAltitude, formatSpeed } from '@/domain/units';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

const CENTER_X = 160;
const CENTER_Y = 132;
const ROSE_RADIUS = 108;
const pointOnRose = (degrees: number, radius: number): { x: number; y: number } => {
  const radians = (degrees - 90) * Math.PI / 180;
  return {
    x: CENTER_X + Math.cos(radians) * radius,
    y: CENTER_Y + Math.sin(radians) * radius
  };
};

const runwayHeading = (runway: Runway): number => runway.lowHeadingTrue ?? runway.highHeadingTrue ?? 0;

export function RunwayDiagram({ runways, metar }: { runways: Runway[]; metar: MetarObservation | null }): React.JSX.Element {
  const { colors } = useAppTheme();
  const { preferences } = usePreferences();
  const openRunways = runways
    .filter((runway) => !runway.closed)
    .sort((left, right) => (right.lengthFt ?? 0) - (left.lengthFt ?? 0))
    .slice(0, 5);
  const primary = openRunways[0];
  if (!primary) return <Text style={{ color: colors.textMuted }}>No runway information available.</Text>;

  const heading = primary.lowHeadingTrue ?? primary.highHeadingTrue;
  const ident = primary.lowHeadingTrue !== null ? primary.lowIdent : primary.highIdent;
  const component = heading !== null && ident
    ? calculateRunwayWind(ident, heading, metar?.windDirectionTrue ?? null, metar?.windSpeedKt ?? null, metar?.windGustKt ?? null)
    : null;
  const longestFt = Math.max(...openRunways.map((runway) => runway.lengthFt ?? 0), 1);
  const windDirection = metar?.windDirectionTrue ?? null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Runway compass</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>North-up view of runway and wind bearings.</Text>
      <Svg width="100%" height={272} viewBox="0 0 320 272" accessibilityLabel="Compass rose with airport runways and wind direction">
        <Circle cx={CENTER_X} cy={CENTER_Y} r={ROSE_RADIUS} fill={colors.surfaceRaised} stroke={colors.border} strokeWidth="2" />
        <Circle cx={CENTER_X} cy={CENTER_Y} r={88} fill="none" stroke={colors.border} strokeWidth="1" />

        {Array.from({ length: 36 }, (_, index) => index * 10).map((degrees) => {
          const major = degrees % 30 === 0;
          const outer = pointOnRose(degrees, ROSE_RADIUS - 2);
          const inner = pointOnRose(degrees, ROSE_RADIUS - (major ? 13 : 7));
          return <Line key={`tick-${degrees}`} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke={major ? colors.text : colors.textMuted} strokeWidth={major ? 2 : 1} />;
        })}

        {Array.from({ length: 12 }, (_, index) => index * 30).map((degrees) => {
          const point = pointOnRose(degrees, 77);
          const label = degrees === 0 ? 'N' : degrees === 90 ? 'E' : degrees === 180 ? 'S' : degrees === 270 ? 'W' : String(degrees);
          return (
            <SvgText key={`label-${degrees}`} x={point.x} y={point.y + 4} textAnchor="middle" fill={degrees % 90 === 0 ? colors.text : colors.textMuted} fontSize={degrees % 90 === 0 ? 12 : 9} fontWeight={degrees % 90 === 0 ? '900' : '700'}>
              {label}
            </SvgText>
          );
        })}

        {openRunways.map((runway, index) => {
          const rotation = runwayHeading(runway);
          const scaledLength = Math.max(74, ((runway.lengthFt ?? longestFt) / longestFt) * 142);
          const isPrimary = index === 0;
          const width = isPrimary ? 18 : 12;
          const runwayTop = CENTER_Y - scaledLength / 2;
          return (
            <G key={runway.id} rotation={rotation} origin={`${CENTER_X}, ${CENTER_Y}`}>
              <Rect
                x={CENTER_X - width / 2}
                y={runwayTop}
                width={width}
                height={scaledLength}
                rx="1.5"
                fill={isPrimary ? colors.textMuted : colors.border}
                stroke={isPrimary ? colors.primary : colors.border}
                strokeWidth={isPrimary ? 2 : 1}
              />
              <Line
                x1={CENTER_X}
                y1={runwayTop + 9}
                x2={CENTER_X}
                y2={runwayTop + scaledLength - 9}
                stroke={colors.surface}
                strokeWidth={isPrimary ? 1.4 : 1}
                strokeDasharray="7 6"
              />
            </G>
          );
        })}

        <Circle cx={CENTER_X} cy={CENTER_Y} r="3" fill={colors.primary} />
        {windDirection !== null ? (
          <G rotation={windDirection} origin={`${CENTER_X}, ${CENTER_Y}`}>
            <Line x1={CENTER_X} y1="7" x2={CENTER_X} y2="43" stroke={colors.primary} strokeWidth="5" strokeLinecap="round" />
            <Polygon points={`${CENTER_X - 9},38 ${CENTER_X + 9},38 ${CENTER_X},51`} fill={colors.primary} />
          </G>
        ) : null}
        <SvgText
          x={CENTER_X}
          y="263"
          textAnchor="middle"
          accessibilityLabel={windDirection === null ? 'Wind direction unavailable or variable' : `Wind from ${Math.round(windDirection)}°`}
          fill={colors.textMuted}
          fontSize="9"
          fontWeight="700"
        >
          {windDirection === null ? 'Wind direction unavailable or variable' : `Wind from ${Math.round(windDirection)}°`}
        </SvgText>
      </Svg>

      <View style={styles.infoRow}>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>PRIMARY RUNWAY</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{primary.lowIdent ?? '—'} / {primary.highIdent ?? '—'}</Text>
          <Text style={[styles.infoDetail, { color: colors.textMuted }]}>{formatAltitude(primary.lengthFt, preferences.altitude)} · {primary.surface ?? 'surface unknown'}</Text>
        </View>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: colors.textMuted }]}>CROSSWIND</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{component ? formatSpeed(component.crosswindKt, preferences.speed) : 'Unavailable'}</Text>
          <Text style={[styles.infoDetail, { color: colors.textMuted }]}>
            {component ? `${component.headwindKt >= 0 ? 'Headwind' : 'Tailwind'} ${formatSpeed(Math.abs(component.headwindKt), preferences.speed)}` : 'Requires fixed-direction wind'}
          </Text>
        </View>
      </View>
      {openRunways.length > 1 ? <Text style={[styles.more, { color: colors.textMuted }]}>All {openRunways.length} open runways are drawn; the longest is emphasized.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16 },
  title: { fontSize: 20, fontWeight: '900' },
  subtitle: { fontSize: 12, marginTop: 4 },
  infoRow: { flexDirection: 'row', gap: 16 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  infoValue: { fontSize: 17, fontWeight: '800', marginTop: 3 },
  infoDetail: { fontSize: 11, marginTop: 3, lineHeight: 15 },
  more: { fontSize: 11, marginTop: 14 }
});
