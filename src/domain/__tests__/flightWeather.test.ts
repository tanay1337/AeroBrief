import { groupFlightWeatherReports, type FlightWeatherAirportSnapshot } from '../flightWeather';

const report = (ident: string, overrides: Partial<FlightWeatherAirportSnapshot> = {}): FlightWeatherAirportSnapshot => ({
  requestedIdent: ident, airportName: ident, weatherIdent: 'EDDB', metarIdent: 'EDDB', tafIdent: 'EDDB',
  metar: 'METAR EDDB', taf: 'TAF EDDB', flightCategory: 'VFR', observedWeather: [], forecastWeather: [], dwdWarnings: [], error: null, ...overrides
});
it('groups identical station reports while retaining every aerodrome and its warnings', () => {
  const warning = { headline: 'Storm', severity: 'Severe', regionName: 'Berlin', onset: null, expires: null };
  const a = report('EDAY'); const b = report('EDCE', { dwdWarnings: [warning], error: 'Partial warning feed' });
  const groups = groupFlightWeatherReports([a, b, report('EDAE', { metarIdent: 'EDAE', metar: 'METAR EDAE' })]);
  expect(groups.map((group) => group.map((airport) => airport.requestedIdent))).toEqual([['EDAY', 'EDCE'], ['EDAE']]);
  expect(groups[0]?.[1]?.dwdWarnings).toEqual([warning]);
  expect(groups[0]?.[1]?.error).toBe('Partial warning feed');
});
it('preserves different TAFs and report versions even when the METAR station matches', () => {
  expect(groupFlightWeatherReports([report('EDAY'), report('EDCE', { tafIdent: 'EDDP', taf: 'TAF EDDP' }), report('EDAE', { metar: 'METAR EDDB UPDATED' })])).toHaveLength(3);
});
it('keeps unavailable aerodrome reports visible separately', () => {
  expect(groupFlightWeatherReports([report('EDAY', { metar: null }), report('EDCE', { metar: null })])).toHaveLength(2);
});
