import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usableGpsFix, type GpsFix } from '@/domain/gps';

export function useForegroundGps() {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [enabled, setEnabled] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [status, setStatus] = useState('GPS off');
  const [now, setNow] = useState(() => Date.now());
  const permissionRequest = useRef(false);
  const native = NativeModules.AeroBriefLocation;
  const toggle = useCallback(async () => {
    if (permissionRequest.current) return;
    if (enabled) { setEnabled(false); setFix(null); setStatus('GPS off'); return; }
    if (Platform.OS !== 'android' || !native) { setStatus('GPS requires the location-enabled Android build'); return; }
    permissionRequest.current = true;
    try {
      const result = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
      if (result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED && result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED) { setStatus('Location permission denied; enable it in Android settings'); return; }
      setStatus('Waiting for a GPS fix'); setEnabled(true);
    } catch { setStatus('Location permission could not be requested'); }
    finally { permissionRequest.current = false; }
  }, [enabled, native]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !foreground || !focused || !native) return;
    let active = true;
    const emitter = new NativeEventEmitter(native);
    const subscription = emitter.addListener('AeroBriefLocationFix', (value: GpsFix) => {
      if (!active) return;
      setNow(Date.now()); setFix(value);
      setStatus(value.mocked ? 'Mock location rejected' : !usableGpsFix(value) ? 'Waiting for a fresh, accurate location' : 'GPS');
    });
    void native.start().catch((error: Error) => { if (active) { setStatus(error.message); setEnabled(false); } });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; subscription.remove(); clearInterval(timer); native.stop(); };
  }, [enabled, foreground, focused, native]);
  const position = enabled && foreground && focused && usableGpsFix(fix, now) ? fix : undefined;
  return { available: Platform.OS === 'android' && Boolean(native), enabled, position, toggle, status: position ? `GPS ±${Math.round(position.accuracy)} m` : enabled && fix && now - fix.timestamp > 15000 ? 'GPS signal stale; position hidden' : status };
}
