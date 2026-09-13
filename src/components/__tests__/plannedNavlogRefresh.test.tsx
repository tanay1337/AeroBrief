import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { routeTestDatabase } from '../../../test/sqlite';
import { getRoutePlan, saveRoutePlan } from '@/data/routePlans';
import { saveRouteEdit } from '@/data/routeEdits';
import { createPlannedFlight } from '@/data/plannedFlights';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import Navlog from '../../../app/route-plan-view';

let mockDb: ReturnType<typeof routeTestDatabase>['db'];
let mockParams: { id: string; plannedFlightId: string };
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Text' }));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useFocusEffect: jest.fn(), Stack: { Screen: 'View' }, router: { push: jest.fn() } }));
jest.mock('@/hooks/useForegroundGps', () => ({ useForegroundGps: () => ({ available: false }) }));
jest.mock('@/components/AeronauticalMap', () => ({ AeronauticalMap: () => null }));

it('refetches the current flight route and altitude on focus after an edited copy replaces the original', async () => {
  const fixture = routeTestDatabase(); mockDb = fixture.db;
  const id = await saveRoutePlan(mockDb, { id: '', title: 'EDAY to EDAZ', waypoints: [
    { id: 'a', ident: 'EDAY', name: 'Strausberg', latitude: 52.58, longitude: 13.92, source: 'AIRPORT' },
    { id: 'b', ident: 'EDAZ', name: 'Schoenhagen', latitude: 52.20, longitude: 13.16, source: 'AIRPORT', plannedAltitudeFt: 2000 }
  ], cruiseSpeedKt: 100, fuelBurnPerHour: 20, fuelUnit: 'L', windDirectionTrue: 270, windSpeedKt: 10,
  windSource: 'MANUAL', windStation: null, windStationDistanceKm: null, windObservedAt: null, airacCycle: '2609' });
  const plannedFlightId = await createPlannedFlight(mockDb, { routePlanId: id, departureAirport: 'EDAY', arrivalAirport: 'EDAZ', departureDate: '', departureTime: '', aircraftProfileId: null, localArea: false });
  mockParams = { id, plannedFlightId };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
  const screen = await render(<PreferencesProvider><AppThemeProvider><QueryClientProvider client={client}><Navlog /></QueryClientProvider></AppThemeProvider></PreferencesProvider>);
  await waitFor(() => expect(screen.getByText('2000 ft')).toBeTruthy());
  const original = (await getRoutePlan(mockDb, id))!;
  await saveRouteEdit(mockDb, { ...original, waypoints: original.waypoints.map((point, i) => ({ ...point, plannedAltitudeFt: i ? 3500 : null })) }, { flightId: plannedFlightId });
  const focus = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
  await act(() => focus());
  await waitFor(() => expect(screen.getByText('3500 ft')).toBeTruthy());
  expect((await getRoutePlan(mockDb, id))?.waypoints[1]?.plannedAltitudeFt).toBe(2000);
  await screen.unmount(); client.clear(); fixture.sqlite.close();
});
