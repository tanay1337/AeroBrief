export interface GpsFix { latitude: number; longitude: number; accuracy: number; timestamp: number; mocked?: boolean; speedMps?: number; }
export function usableGpsFix(fix: GpsFix | null, now = Date.now()): fix is GpsFix {
  return Boolean(fix && [fix.latitude, fix.longitude, fix.accuracy, fix.timestamp].every(Number.isFinite) && Math.abs(fix.latitude) <= 85.05112878 && Math.abs(fix.longitude) <= 180 && fix.accuracy >= 0 && fix.accuracy <= 100 && !fix.mocked && now - fix.timestamp >= -2000 && now - fix.timestamp <= 15000);
}
