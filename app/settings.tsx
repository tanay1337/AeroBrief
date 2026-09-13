import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { getAirport } from '@/data/database';
import type { UnitPreferences } from '@/domain/models';
import { usePreferences } from '@/state/preferences';
import { useAppTheme } from '@/theme/theme';

interface Option<T extends string> { label: string; value: T }

function SettingGroup<K extends keyof UnitPreferences>({
  title,
  field,
  options
}: {
  title: string;
  field: K;
  options: Option<Extract<UnitPreferences[K], string>>[];
}): React.JSX.Element {
  const { preferences, updatePreferences } = usePreferences();
  const { colors } = useAppTheme();
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: colors.text }]}>{title}</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = preferences[field] === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => void updatePreferences({ [field]: option.value } as Partial<UnitPreferences>)}
              style={[styles.option, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
            >
              <Text style={[styles.optionText, { color: selected ? '#FFFFFF' : colors.text }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MapStartAirportSetting(): React.JSX.Element {
  const db = useSQLiteContext();
  const { preferences, updatePreferences } = usePreferences();
  const { colors } = useAppTheme();
  const [value, setValue] = useState(preferences.mapStartAirport);
  const [status, setStatus] = useState('Used as the departure airport in Quick plan and the map start point.');

  const saveAirport = async () => {
    const ident = value.trim().toUpperCase();
    if (!ident) {
      await updatePreferences({ mapStartAirport: '' });
      setStatus('Cleared. The most recently viewed airport will be used.');
      return;
    }
    const airport = await getAirport(db, ident);
    if (!airport) {
      setStatus('Airport not found. Enter an ICAO or local airport identifier.');
      return;
    }
    const resolved = airport.weatherCode || airport.ident;
    setValue(resolved);
    await updatePreferences({ mapStartAirport: resolved });
    setStatus(`${airport.name} will be your default departure and map start point.`);
  };

  return <View style={styles.group}>
    <Text style={[styles.groupTitle, { color: colors.text }]}>Home airport</Text>
    <View style={styles.airportInputRow}>
      <TextInput
        accessibilityLabel="Home airport"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        value={value}
        onChangeText={(next) => setValue(next.toUpperCase())}
        onSubmitEditing={() => void saveAirport()}
        placeholder="e.g. EDAY"
        placeholderTextColor={colors.textMuted}
        style={[styles.airportInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
      />
      <Pressable accessibilityRole="button" onPress={() => void saveAirport().catch(() => setStatus('Could not save airport. Please try again.'))} style={[styles.setAirportButton, { backgroundColor: colors.primary }]}>
        <Text style={styles.setAirportText}>Set</Text>
      </Pressable>
    </View>
    <Text style={[styles.airportHelper, { color: colors.textMuted }]}>{status}</Text>
  </View>;
}

export default function SettingsScreen(): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <Screen>
      <Text style={[styles.intro, { color: colors.textMuted }]}>Choose how weather and airport values are displayed. Changes apply immediately throughout the app.</Text>
      <SettingGroup title="Wind speed" field="speed" options={[{ label: 'Knots', value: 'kt' }, { label: 'km/h', value: 'kmh' }, { label: 'mph', value: 'mph' }, { label: 'm/s', value: 'ms' }]} />
      <SettingGroup title="Visibility" field="visibility" options={[{ label: 'Kilometres', value: 'km' }, { label: 'Statute miles', value: 'sm' }]} />
      <SettingGroup title="Altitude & ceiling" field="altitude" options={[{ label: 'Feet', value: 'ft' }, { label: 'Metres', value: 'm' }]} />
      <SettingGroup title="Temperature" field="temperature" options={[{ label: 'Celsius', value: 'c' }, { label: 'Fahrenheit', value: 'f' }]} />
      <SettingGroup title="Pressure" field="pressure" options={[{ label: 'hPa', value: 'hpa' }, { label: 'inHg', value: 'inhg' }]} />
      <SettingGroup title="Time" field="time" options={[{ label: 'Airport local', value: 'local' }, { label: 'UTC', value: 'utc' }]} />
      <SettingGroup title="Appearance" field="theme" options={[{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]} />
      <MapStartAirportSetting />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  group: { gap: 9 },
  groupTitle: { fontSize: 16, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, justifyContent: 'center' },
  optionText: { fontSize: 14, fontWeight: '700' },
  airportInputRow: { flexDirection: 'row', gap: 9 },
  airportInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 15, fontWeight: '800' },
  setAirportButton: { minWidth: 64, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  setAirportText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  airportHelper: { fontSize: 11, lineHeight: 16 },
});
