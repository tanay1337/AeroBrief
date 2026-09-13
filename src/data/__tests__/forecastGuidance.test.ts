import { fetchGfsGuidance, mapGfsGuidance } from '../forecastGuidance';

describe('NOAA GFS guidance mapping', () => {
  it('maps surface and pressure-level winds with UTC timestamps', () => {
    const result = mapGfsGuidance({ hourly: {
      time: ['2026-09-04T12:00'],
      temperature_2m: [21], dew_point_2m: [16], precipitation_probability: [40],
      wind_speed_10m: [13], wind_direction_10m: [250], wind_gusts_10m: [24],
      wind_speed_925hPa: [30], wind_direction_925hPa: [260], geopotential_height_925hPa: [760]
    } });
    expect(result.hours[0]).toMatchObject({
      at: Date.parse('2026-09-04T12:00Z') / 1000,
      temperatureC: 21,
      precipitationProbability: 40,
      windSpeedKt: 13,
      windGustKt: 24
    });
    expect(result.hours[0]?.levels.find((level) => level.pressureHpa === 925)).toMatchObject({
      altitudeFt: 760 * 3.28084,
      speedKt: 30,
      directionTrue: 260
    });
    expect(result.hours[0]?.levels.map((level) => level.pressureHpa)).toEqual([1000, 950, 925, 900, 850, 800]);
  });

  it('returns an empty safe result for malformed responses', () => {
    expect(mapGfsGuidance(null).hours).toEqual([]);
  });

  it('requests the six GFS pressure levels', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ hourly: { time: [] } })
    } as Response);

    await fetchGfsGuidance(52.5806, 13.9167);

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain('api.open-meteo.com/v1/gfs');
    expect(requestUrl).toContain('wind_speed_800hPa');
    expect(requestUrl).not.toContain('wind_speed_975hPa');
    fetchMock.mockRestore();
  });
});
