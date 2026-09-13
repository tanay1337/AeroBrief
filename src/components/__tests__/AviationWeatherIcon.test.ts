import type { TafPeriod } from '@/domain/models';
import { tafWeatherIcon } from '@/domain/tafWeatherIcon';

const period = (weather: string[], covers: string[] = []): TafPeriod => ({
  from: 0, to: 3600, becomingAt: null, change: 'BASE', probability: null,
  windDirectionTrue: null, windSpeedKt: null, windGustKt: null,
  visibilitySm: null, visibilityQualifier: null, visibilityIsTenKmOrMore: false,
  weather, clouds: covers.map((cover) => ({ cover, baseFt: 3000, type: null })),
  verticalVisibilityFt: null, category: 'VFR'
});

describe('TAF weather icons', () => {
  it('prioritizes thunderstorm and precipitation symbology', () => {
    expect(tafWeatherIcon(period(['TSRA'])).name).toBe('thunderstorm-outline');
    expect(tafWeatherIcon(period(['SHRA'])).name).toBe('rainy-outline');
  });

  it('uses cloud and clear-sky symbology when no weather is encoded', () => {
    expect(tafWeatherIcon(period([], ['BKN'])).name).toBe('partly-sunny-outline');
    expect(tafWeatherIcon(period([])).name).toBe('sunny-outline');
  });

  it('uses moon-based cloud and clear-sky symbology at night', () => {
    expect(tafWeatherIcon(period([], ['BKN']), true).name).toBe('cloudy-night-outline');
    expect(tafWeatherIcon(period([]), true).name).toBe('moon-outline');
  });
});
