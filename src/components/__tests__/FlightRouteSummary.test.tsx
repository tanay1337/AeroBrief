import React from 'react';
import { render } from '@testing-library/react-native';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import { FlightRouteSummary } from '../FlightRouteSummary';
import type { RoutePlan } from '@/domain/routePlanning';
const plan: RoutePlan = { id: 'r', title: 'EDAY to EDCE', waypoints: [
  { id: 'a', ident: 'EDAY', name: 'Strausberg', latitude: 52.58, longitude: 13.92, source: 'AIRPORT' },
  { id: 'b', ident: 'EDCE', name: 'Eggersdorf', latitude: 52.48, longitude: 14.09, source: 'AIRPORT', plannedAltitudeFt: 2500 }
], cruiseSpeedKt: null, fuelBurnPerHour: null, fuelUnit: 'L', windDirectionTrue: 270, windSpeedKt: 8,
windSource: 'METAR', windStation: 'EDDB', windStationDistanceKm: 38, windObservedAt: Date.UTC(2026, 8, 13), airacCycle: '2609', createdAt: 1, updatedAt: 1 };
async function show(route: RoutePlan) { return render(<PreferencesProvider><AppThemeProvider><FlightRouteSummary plan={route} /></AppThemeProvider></PreferencesProvider>); }
it('shows the selected direct route and explains why wind correction and EET are unavailable without TAS', async () => {
  const screen = await show(plan);
  expect(screen.getByText('EDAY → EDCE')).toBeTruthy();
  expect(screen.getByText('Distance')).toBeTruthy(); expect(screen.getByText('EET')).toBeTruthy();
  expect(screen.getByText('EDDB surface wind · 270°T / 8 kt')).toBeTruthy();
  expect(screen.getByText('Add TAS in the route editor for EET and wind correction.')).toBeTruthy();
  expect(screen.getByText(/2 waypoints · AIRAC 2609.*2,500 ft/)).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(2);
  await screen.unmount();
});
it('shows computed EET and trip fuel when performance is supplied', async () => {
  const screen = await show({ ...plan, cruiseSpeedKt: 100, fuelBurnPerHour: 20 });
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.getByText(/.*TAS 100 kt/)).toBeTruthy();
  expect(screen.getByText(/^\d+\.\d L$/)).toBeTruthy();
  await screen.unmount();
});
