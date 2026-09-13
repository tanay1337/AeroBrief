import { render } from '@testing-library/react-native';
import React from 'react';
import type { MetarObservation, Runway } from '@/domain/models';
import { PreferencesProvider } from '@/state/preferences';
import { AppThemeProvider } from '@/theme/theme';
import { RunwayDiagram } from '../RunwayDiagram';

const runways: Runway[] = [
  {
    id: 1,
    airportId: 1,
    lengthFt: 3937,
    widthFt: 92,
    surface: 'CON',
    lighted: true,
    closed: false,
    lowIdent: '05',
    lowHeadingTrue: 50,
    highIdent: '23',
    highHeadingTrue: 230
  }
];

const metar: MetarObservation = {
  icao: 'EDDB',
  raw: 'METAR EDDB 050950Z 26013KT 9999 SCT040 20/12 Q1015',
  observedAt: Date.UTC(2026, 8, 5, 9, 50),
  reportType: 'METAR',
  temperatureC: 20,
  dewpointC: 12,
  windDirectionTrue: 260,
  windSpeedKt: 13,
  windGustKt: null,
  visibilitySm: 6.2,
  visibilityQualifier: 'MORE_THAN',
  visibilityIsTenKmOrMore: true,
  cavok: false,
  pressureHpa: 1015,
  weather: [],
  clouds: [{ cover: 'SCT', baseFt: 4000, type: null }],
  verticalVisibilityFt: null,
  category: 'VFR',
  trends: []
};

describe('RunwayDiagram', () => {
  it('renders the primary runway summary and concise wind direction', async () => {
    const screen = await render(
      <PreferencesProvider>
        <AppThemeProvider>
          <RunwayDiagram runways={runways} metar={metar} />
        </AppThemeProvider>
      </PreferencesProvider>
    );

    expect(screen.getByLabelText('Wind from 260°')).toBeTruthy();
    expect(screen.getByText('05 / 23')).toBeTruthy();
    expect(screen.queryByText(/true/i)).toBeNull();
  });
});
