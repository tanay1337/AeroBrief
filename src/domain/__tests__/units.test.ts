import { formatAltitude, formatPressure, formatSpeed, formatTemperature, formatVisibility } from '../units';

describe('unit formatting', () => {
  it('converts aviation units', () => {
    expect(formatSpeed(10, 'kmh')).toBe('19 km/h');
    expect(formatSpeed(10, 'ms')).toBe('5.1 m/s');
    expect(formatVisibility(10, 'km')).toBe('16.1 km');
    expect(formatVisibility(6, 'km', { qualifier: 'MORE_THAN', tenKmOrMore: true })).toBe('10 km+');
    expect(formatAltitude(1000, 'm')).toBe('305 m');
    expect(formatTemperature(20, 'f')).toBe('68°F');
    expect(formatPressure(1013.25, 'inhg')).toBe('29.92 inHg');
  });

  it('uses an em dash for missing values', () => {
    expect(formatSpeed(null, 'kt')).toBe('—');
    expect(formatPressure(null, 'hpa')).toBe('—');
  });
});
