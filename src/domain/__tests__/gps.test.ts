import { usableGpsFix } from '@/domain/gps';
const now = 100000;
const fix = { latitude: 52.5, longitude: 13.5, accuracy: 10, timestamp: now };
it('accepts a fresh GNSS position and rejects stale, mocked, and inaccurate fixes', () => {
  expect(usableGpsFix(fix, now)).toBe(true);
  expect(usableGpsFix(fix, now + 15001)).toBe(false);
  expect(usableGpsFix({ ...fix, mocked: true }, now)).toBe(false);
  expect(usableGpsFix({ ...fix, accuracy: 101 }, now)).toBe(false);
  expect(usableGpsFix({ ...fix, latitude: NaN }, now)).toBe(false);
  expect(usableGpsFix({ ...fix, timestamp: now + 3000 }, now)).toBe(false);
});
