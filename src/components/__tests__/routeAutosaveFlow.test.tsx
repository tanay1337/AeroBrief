import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router/react-navigation';
import { routeTestDatabase } from '../../../test/sqlite';
import { getRoutePlan, saveRoutePlan } from '@/data/routePlans';
import { createPlannedFlight, getPlannedFlight } from '@/data/plannedFlights';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import RoutePlanner from '../../../app/route-planner';

let mockDb: ReturnType<typeof routeTestDatabase>['db'];
let mockParams: { id: string; flightId: string };
const mockDispatch = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Text' }));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, Stack: { Screen: 'View' }, router: { replace: jest.fn() } }));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: jest.fn(), useNavigation: () => ({ dispatch: mockDispatch }) }));
jest.mock('@/hooks/useForegroundGps', () => ({ useForegroundGps: () => ({ available: false }) }));
jest.mock('@/components/AeronauticalMap', () => ({ AeronauticalMap: () => null }));
jest.mock('@/data/database', () => ({ getAirport: jest.fn().mockResolvedValue(null), getMostRecentAirport: jest.fn().mockResolvedValue(null), searchAirports: jest.fn().mockResolvedValue([]) }));
jest.mock('@/data/routeWeather', () => ({ getRouteMetarWind: jest.fn().mockResolvedValue(null) }));

const original = { id: 'route', title: 'Original route', waypoints: [
  { id: 'a', ident: 'EDAY', name: 'Strausberg', latitude: 52.58, longitude: 13.92, source: 'AIRPORT' as const },
  { id: 'b', ident: 'EDAZ', name: 'Schoenhagen', latitude: 52.20, longitude: 13.16, source: 'AIRPORT' as const }
], cruiseSpeedKt: 100, fuelBurnPerHour: 20, fuelUnit: 'L' as const, windDirectionTrue: 270, windSpeedKt: 10,
windSource: 'MANUAL' as const, windStation: null, windStationDistanceKm: null, windObservedAt: null, airacCycle: '2609' };

it('autosaves an edit after an unchanged open, protects the source, and flushes before tab navigation', async () => {
  const fixture = routeTestDatabase(); mockDb = fixture.db;
  await saveRoutePlan(mockDb, original);
  const flightId = await createPlannedFlight(mockDb, { routePlanId: original.id, departureAirport: 'EDAY', arrivalAirport: 'EDAZ', departureDate: '', departureTime: '', aircraftProfileId: null, localArea: false });
  mockParams = { id: original.id, flightId };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['route-plan', original.id], await getRoutePlan(mockDb, original.id));
  const screen = await render(<PreferencesProvider><AppThemeProvider><QueryClientProvider client={client}><RoutePlanner /></QueryClientProvider></AppThemeProvider></PreferencesProvider>);
  await fireEvent.press(screen.getByLabelText('Open route editor'));
  await waitFor(() => expect(screen.getByText('Saved locally')).toBeTruthy());
  expect((await getPlannedFlight(mockDb, flightId))?.routePlanId).toBe(original.id);
  expect(screen.queryByText('Save')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Route title'), 'New title');
  const calls = jest.mocked(usePreventRemove).mock.calls;
  const prevent = calls.at(-1)!;
  expect(prevent[0]).toBe(true);
  const action = { type: 'REPLACE', payload: { name: 'index' } };
  await act(() => prevent[1]({ data: { action } }));
  await waitFor(() => expect(mockDispatch).toHaveBeenCalledWith(action));
  const flight = (await getPlannedFlight(mockDb, flightId))!;
  expect(flight.routePlanId).not.toBe(original.id);
  expect((await getRoutePlan(mockDb, original.id))?.title).toBe(original.title);
  expect((await getRoutePlan(mockDb, flight.routePlanId!))?.title).toBe('New title');
  await screen.unmount(); client.clear(); fixture.sqlite.close();
}, 15000);
