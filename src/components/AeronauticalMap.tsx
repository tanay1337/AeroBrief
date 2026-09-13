import { WebView, type DomWebViewRef } from '@expo/dom-webview';
import { Directory, File, Paths } from 'expo-file-system';
import React, { forwardRef, useMemo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { buildAeronauticalMapHtml } from '@/data/aeronauticalMapHtml';
import type { RouteWaypoint } from '@/domain/routePlanning';
import { useAppTheme } from '@/theme/theme';

interface AeronauticalMapProps {
  waypoints: RouteWaypoint[];
  cycle: string;
  aeronauticalLayerVisible: boolean;
  baseLayer: 'chart' | 'satellite';
  initialCenter?: { latitude: number; longitude: number };
  currentPosition?: { latitude: number; longitude: number; accuracy?: number };
  onReady?: () => void;
  onMapPress?: () => void;
  onLongPress: (longitude: number, latitude: number) => void;
}

export interface AeronauticalMapRef {
  flyTo(longitude: number, latitude: number, zoom?: number): void;
  fitRoute(): void;
  refreshTiles(): void;
}

export const AeronauticalMap = forwardRef<AeronauticalMapRef, AeronauticalMapProps>(function AeronauticalMap(
  { waypoints, cycle, aeronauticalLayerVisible, baseLayer, initialCenter, currentPosition, onReady, onMapPress, onLongPress },
  ref
): React.JSX.Element {
  const { colors, dark } = useAppTheme();
  const webView = useRef<DomWebViewRef>(null);
  const retainedView = useRef<{ latitude: number; longitude: number; zoom: number } | undefined>(undefined);
  const [uri, setUri] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [atDetailLimit, setAtDetailLimit] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const initialLatitude = initialCenter?.latitude;
  const initialLongitude = initialCenter?.longitude;
  const stableCenter = useMemo(() => initialLatitude !== undefined && initialLongitude !== undefined ? { latitude: initialLatitude, longitude: initialLongitude } : undefined, [initialLatitude, initialLongitude]);
  const webSource = useMemo(() => uri ? { uri } : undefined, [uri]);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setAtDetailLimit(false);
    const cache = new Directory(Paths.cache, `aerobrief-map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    cache.create({ intermediates: true, idempotent: true });
    const html = new File(cache, 'map.html');
    html.write(buildAeronauticalMapHtml(cycle, dark, stableCenter, retainedView.current));
    setUri(html.uri);
    return () => {
      if (cache.exists) cache.delete();
    };
  }, [cycle, dark, stableCenter, retryCount]);

  useEffect(() => {
    if (!uri || ready || failed) return;
    const timeout = setTimeout(() => setFailed(true), 8000);
    return () => clearTimeout(timeout);
  }, [uri, ready, failed]);

  useEffect(() => {
    if (!ready) return;
    webView.current?.injectJavaScript(`window.setAeroBriefRoute(${JSON.stringify(JSON.stringify(waypoints))});true;`);
  }, [ready, waypoints]);

  useEffect(() => {
    if (!ready) return;
    webView.current?.injectJavaScript(`window.setAeroBriefLayerVisible(${aeronauticalLayerVisible});true;`);
  }, [aeronauticalLayerVisible, ready]);

  useEffect(() => {
    if (!ready) return;
    webView.current?.injectJavaScript(`window.setAeroBriefBaseLayer(${JSON.stringify(baseLayer)});true;`);
  }, [baseLayer, ready]);

  useEffect(() => {
    if (!ready) return;
    if (!currentPosition) { webView.current?.injectJavaScript('window.clearAeroBriefLocation();true;'); return; }
    webView.current?.injectJavaScript(`window.setAeroBriefLocation(${currentPosition.longitude},${currentPosition.latitude},${currentPosition.accuracy ?? 0});true;`);
  }, [currentPosition, ready]);

  useImperativeHandle(ref, () => ({
    flyTo: (longitude, latitude, zoom = 11) => webView.current?.injectJavaScript(`window.flyAeroBriefTo(${longitude},${latitude},${zoom});true;`),
    fitRoute: () => webView.current?.injectJavaScript('window.fitAeroBriefRoute();true;'),
    refreshTiles: () => { setFailed(false); webView.current?.injectJavaScript('window.refreshAeroBriefTiles();true;'); }
  }), []);

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; longitude?: number; latitude?: number; zoom?: number; atDetailLimit?: boolean };
      if (message.type === 'ready') {
        setReady(true);
        setFailed(false);
        onReady?.();
      } else if (message.type === 'longPress' && typeof message.longitude === 'number' && typeof message.latitude === 'number') {
        onLongPress(message.longitude, message.latitude);
      } else if (message.type === 'mapPress') {
        onMapPress?.();
      } else if (message.type === 'mapView' && typeof message.longitude === 'number' && typeof message.latitude === 'number' && typeof message.zoom === 'number' && Number.isFinite(message.zoom)) {
        retainedView.current = { longitude: message.longitude, latitude: message.latitude, zoom: message.zoom };
      } else if (message.type === 'mapScriptError') {
        setFailed(true);
      } else if (message.type === 'tileError') {
        setFailed(true);
      } else if (message.type === 'mapStatus') {
        setAtDetailLimit(message.atDetailLimit === true);
      }
    } catch {
      // Ignore messages not emitted by the local map surface.
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceRaised }]}>
      {uri ? <WebView key={uri} ref={webView} source={webSource!} onMessage={handleMessage} containerStyle={styles.map} style={styles.map} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} onRenderProcessGone={() => setFailed(true)} /> : null}
      {!ready && !failed ? <View pointerEvents="none" style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={[styles.stateText, { color: colors.text }]}>Loading aeronautical map</Text></View> : null}
      {!ready && failed ? <View style={styles.state}><Text style={[styles.stateText, { color: colors.text }]}>Map could not load</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading map" onPress={() => setRetryCount((value) => value + 1)} style={[styles.retry, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '800' }}>Retry</Text></Pressable></View> : null}
      {ready && failed ? <View pointerEvents="none" style={[styles.error, { backgroundColor: colors.surface }]}><Text style={[styles.errorText, { color: colors.warning }]}>Some map tiles could not be loaded</Text></View> : null}
      {ready && atDetailLimit ? <View pointerEvents="none" style={[styles.detailNotice, { backgroundColor: colors.surface }]}><Text style={[styles.detailNoticeText, { color: colors.text }]}>OFM aeronautical detail limit</Text><Text style={[styles.detailNoticeSubtext, { color: colors.textMuted }]}>{baseLayer === 'satellite' ? 'Hide overlay to zoom further into imagery' : 'Chart tiles have no more detail at this scale'}</Text></View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' }, map: { flex: 1, backgroundColor: 'transparent' },
  state: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(13, 23, 27, 0.52)' },
  stateText: { fontSize: 15, fontWeight: '900' }, retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }, error: { position: 'absolute', left: 10, right: 10, bottom: 38, borderRadius: 10, padding: 9 }, errorText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  detailNotice: { position: 'absolute', left: 10, top: 10, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, elevation: 3 }, detailNoticeText: { fontSize: 10, fontWeight: '900' }, detailNoticeSubtext: { fontSize: 8, fontWeight: '700', marginTop: 2 }
});
