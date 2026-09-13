import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Directory, File } from 'expo-file-system';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getAircraftProfiles, saveAircraftProfile } from '@/data/aircraftProfiles';
import { decodeUtf8Bytes, readPickedFile } from '@/data/localFiles';
import { exportAircraftProfile, importAircraftProfile, type AircraftProfile } from '@/domain/aircraft';
import { useAppTheme } from '@/theme/theme';

export default function AircraftScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const profiles = useQuery({ queryKey: ['aircraft-profiles'], queryFn: () => getAircraftProfiles(db) });
  useFocusEffect(useCallback(() => { void queryClient.invalidateQueries({ queryKey: ['aircraft-profiles'] }); }, [queryClient]));

  const importProfile = async () => {
    try {
      setBusy(true);
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
      if (picked.canceled) return;
      const file = await readPickedFile(picked.result);
      const id = await saveAircraftProfile(db, importAircraftProfile(decodeUtf8Bytes(file.bytes)), false);
      await queryClient.invalidateQueries({ queryKey: ['aircraft-profiles'] });
      Alert.alert('Profile imported as Draft', 'Check every value against the current approved aircraft documents before marking it Ready.', [{ text: 'Review profile', onPress: () => router.push({ pathname: '/aircraft-entry', params: { id } }) }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The profile could not be imported.';
      if (!/cancel/i.test(message)) Alert.alert('Import failed', message);
    } finally { setBusy(false); }
  };

  const exportProfile = async (profile: AircraftProfile) => {
    try {
      const directory = await Directory.pickDirectoryAsync();
      const safeRegistration = profile.registration.replace(/[^A-Za-z0-9-]/g, '_');
      const file = directory.createFile(`AeroBrief-${safeRegistration}-profile-r${profile.revision}.json`, 'application/json');
      file.write(exportAircraftProfile(profile));
      Alert.alert('Export complete', `${file.name} was saved. Source document attachments are not included.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The profile could not be exported.';
      if (!/cancel/i.test(message)) Alert.alert('Export failed', message);
    }
  };

  const showReadinessInformation = () => Alert.alert(
    'Profile readiness',
    'Only complete profiles you explicitly mark Ready can be used for mass and balance calculations.'
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Aircraft', headerRight: () => <View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="About aircraft profile readiness" hitSlop={9} onPress={showReadinessInformation}><Ionicons name="information-circle-outline" size={23} color={colors.text} /></Pressable><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Import aircraft profile" hitSlop={9} onPress={() => void importProfile()}><Ionicons name="cloud-upload-outline" size={23} color={colors.text} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add aircraft profile" hitSlop={9} onPress={() => router.push('/aircraft-entry')}><Ionicons name="add-circle-outline" size={25} color={colors.text} /></Pressable></View> }} />
      <Screen>
        {profiles.isLoading ? <StateNotice loading title="Loading aircraft" /> : profiles.isError ? <StateNotice title="Aircraft unavailable" body="The aircraft database could not be opened." /> : !(profiles.data?.length) ? <StateNotice icon="airplane-outline" title="No aircraft profiles" body="Add an aircraft from its approved mass and balance data, or import an AeroBrief profile." actionLabel="Add aircraft" onAction={() => router.push('/aircraft-entry')} /> : profiles.data.map((profile) => (
          <Pressable key={profile.id} onPress={() => router.push({ pathname: '/aircraft-entry', params: { id: profile.id } })} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}><Ionicons name="airplane-outline" size={24} color={colors.primary} /></View>
            <View style={styles.copy}><View style={styles.titleRow}><Text style={[styles.registration, { color: colors.text }]}>{profile.registration}</Text><View style={[styles.status, { backgroundColor: profile.status === 'READY' ? colors.primarySoft : colors.surfaceRaised }]}><Text style={[styles.statusText, { color: profile.status === 'READY' ? colors.success : colors.textMuted }]}>{profile.status === 'READY' ? 'Ready' : 'Draft'}</Text></View></View><Text style={[styles.model, { color: colors.textMuted }]}>{[profile.manufacturer, profile.model].filter(Boolean).join(' ')}</Text><Text style={[styles.meta, { color: colors.textMuted }]}>Revision {profile.revision} · {profile.massUnit} / {profile.armUnit}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Export ${profile.registration}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); void exportProfile(profile); }}><Ionicons name="download-outline" size={21} color={colors.primary} /></Pressable>
          </Pressable>
        ))}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: 17 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 3 }, titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, registration: { fontSize: 20, fontWeight: '900' },
  model: { fontSize: 13, fontWeight: '700' }, meta: { fontSize: 10, fontWeight: '700' }, status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }, statusText: { fontSize: 9, fontWeight: '900' }
});
