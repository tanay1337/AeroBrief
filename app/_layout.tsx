import 'react-native-gesture-handler';
import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import React, { Suspense } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { initializeDatabase } from '@/data/database';
import { BottomTabs } from '@/components/BottomTabs';
import { PreferencesProvider, usePreferences } from '@/state/preferences';
import { AppThemeProvider, useAppTheme } from '@/theme/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 }
  }
});

function LoadingScreen(): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function SafetyGate(): React.JSX.Element | null {
  const { t } = useTranslation();
  const { preferences, ready, updatePreferences } = usePreferences();
  const { colors } = useAppTheme();
  if (!ready || preferences.safetyAcknowledged) return null;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={[styles.dialog, { backgroundColor: colors.surface }]}>
          <View style={[styles.mark, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.markText, { color: colors.primary }]}>AB</Text>
          </View>
          <Text style={[styles.dialogTitle, { color: colors.text }]}>{t('informationalOnly')}</Text>
          <Text style={[styles.dialogBody, { color: colors.textMuted }]}>{t('safetyBody')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void updatePreferences({ safetyAcknowledged: true })}
            style={({ pressed }) => [styles.dialogButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
          >
            <Text style={styles.dialogButtonText}>{t('acknowledge')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AppNavigation(): React.JSX.Element {
  const { colors, dark } = useAppTheme();
  const { ready } = usePreferences();
  if (!ready) return <LoadingScreen />;
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}><Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background }
        }}
      >
        <Stack.Screen name="index" options={{ title: 'AeroBrief' }} />
        <Stack.Screen name="weather" options={{ title: 'Airports' }} />
        <Stack.Screen name="route-planner" options={{ title: 'Map' }} />
        <Stack.Screen name="quick-plan" options={{ title: 'Quick plan' }} />
        <Stack.Screen name="flight-details" options={{ title: 'Flight details' }} />
        <Stack.Screen name="flight-plan" options={{ title: 'Flight plan' }} />
        <Stack.Screen name="route-plans" options={{ title: 'Saved routes' }} />
        <Stack.Screen name="route-plan-view" options={{ title: 'Planned route' }} />
        <Stack.Screen name="search" options={{ title: 'Search airports', presentation: 'modal' }} />
        <Stack.Screen name="station/[icao]" options={{ title: 'Airport weather' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="about" options={{ title: 'About & data' }} />
        <Stack.Screen name="tools" options={{ title: 'More' }} />
        <Stack.Screen name="logbook" options={{ title: 'Logbook' }} />
        <Stack.Screen name="logbook-import" options={{ title: 'Import logbook' }} />
        <Stack.Screen name="logbook-entry" options={{ title: 'Flight entry' }} />
        <Stack.Screen name="logbook-flight" options={{ title: 'Flight' }} />
        <Stack.Screen name="flight-weather" options={{ title: 'Weather briefing' }} />
        <Stack.Screen name="documents" options={{ title: 'Pilot documents' }} />
        <Stack.Screen name="document-entry" options={{ title: 'Pilot document' }} />
        <Stack.Screen name="document-view" options={{ title: 'Document' }} />
        <Stack.Screen name="aircraft" options={{ title: 'Aircraft' }} />
        <Stack.Screen name="aircraft-entry" options={{ title: 'Aircraft profile' }} />
        <Stack.Screen name="weight-balance" options={{ title: 'Mass and Balance' }} />
        <Stack.Screen name="weight-balance-entry" options={{ title: 'Mass and Balance' }} />
      </Stack><BottomTabs /></View>
      <SafetyGate />
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <PreferencesProvider>
      <AppThemeProvider>
        <Suspense fallback={<LoadingScreen />}>
          <SQLiteProvider
            databaseName="aerobrief-v2.db"
            assetSource={{ assetId: require('../assets/airports.db') }}
            onInit={initializeDatabase}
            useSuspense
          >
            <QueryClientProvider client={queryClient}>
              <AppNavigation />
            </QueryClientProvider>
          </SQLiteProvider>
        </Suspense>
      </AppThemeProvider>
    </PreferencesProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(3, 15, 20, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 460, borderRadius: 26, padding: 24, alignItems: 'center' },
  mark: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 22, fontWeight: '900', letterSpacing: -1 },
  dialogTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 18 },
  dialogBody: { fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10 },
  dialogButton: { minHeight: 50, width: '100%', borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  dialogButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }
});
