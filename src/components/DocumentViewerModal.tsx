import { Ionicons } from '@expo/vector-icons';
import { WebView, type DomWebViewRef } from '@expo/dom-webview';
import { Directory, File, Paths } from 'expo-file-system';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { buildImageViewerHtml } from '@/data/imageViewerTemplate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme';

export interface DocumentImagePage {
  uri: string;
  aspectRatio: number;
}

export const getDocumentImagePage = (uri: string): Promise<DocumentImagePage> => new Promise((resolve) => {
  Image.getSize(uri, (width, height) => resolve({ uri, aspectRatio: width > 0 && height > 0 ? width / height : 0.75 }), () => resolve({ uri, aspectRatio: 0.75 }));
});

export interface DocumentViewerState {
  name: string;
  pages: DocumentImagePage[];
  webUri?: string;
  directory: Directory | null;
  loading: boolean;
  error?: string;
}

export function DocumentViewerModal({ viewer, onClose }: { viewer: DocumentViewerState | null; onClose: () => void }): React.JSX.Element {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<DomWebViewRef>(null);
  const [zoom, setZoom] = useState(1);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const imagePages = viewer?.pages;
  useEffect(() => {
    let active = true;
    const directory = new Directory(Paths.cache, `aerobrief-images-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    async function prepare() {
      setImageUri(null); setImageError(false); setZoom(1);
      if (!imagePages?.length) return;
      try {
        directory.create({ intermediates: true, idempotent: true });
        const entries = [];
        for (let index = 0; index < imagePages.length; index++) {
          const page = imagePages[index]!;
          const extension = page.uri.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? 'jpg';
          const filename = `image-${index}.${extension}`;
          await new File(page.uri).copy(new File(directory, filename), { overwrite: true });
          entries.push({ filename, aspectRatio: page.aspectRatio > 0 ? page.aspectRatio : 0.75 });
        }
        if (!active) return;
        const file = new File(directory, 'viewer.html'); file.write(buildImageViewerHtml(entries));
        setImageUri(file.uri);
      } catch { if (active) setImageError(true); }
      finally { if (!active && directory.exists) directory.delete(); }
    }
    void prepare();
    return () => { active = false; if (directory.exists) directory.delete(); };
  }, [imagePages]);
  const documentUri = viewer?.webUri ?? imageUri;
  // A zoom report must not change WebView source identity and reload the page.
  const webSource = useMemo(() => documentUri ? { uri: documentUri } : undefined, [documentUri]);
  const hasZoomableDocument = Boolean(documentUri && viewer && !viewer.loading && !viewer.error && (viewer.webUri || viewer.pages.length));
  const clampZoom = (next: number) => Math.min(4, Math.max(1, Math.round(next * 20) / 20));
  const setDocumentZoom = (next: number) => {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (documentUri) {
      webViewRef.current?.injectJavaScript(`window.__aeroBriefRequestedZoom=${clamped};if(window.setAeroBriefZoom)window.setAeroBriefZoom(${clamped});true;`);
    }
  };
  const adjustZoom = (amount: number) => setDocumentZoom(zoom + amount);

  const close = () => { setZoom(1); onClose(); };
  const handleWebMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; value?: number };
      if (message.type === 'zoom' && typeof message.value === 'number') setZoom(clampZoom(message.value));
    } catch { /* Ignore messages not emitted by the local PDF viewer. */ }
  };
  return (
    <Modal visible={Boolean(viewer)} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={styles.container}>
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 10 }]}> 
          <View style={styles.headerText}><Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{viewer?.name}</Text>{viewer && !viewer.loading && viewer.pages.length > 1 ? <Text style={[styles.pageCount, { color: colors.textMuted }]}>{viewer.pages.length} pages</Text> : null}</View>
          {hasZoomableDocument ? <View style={[styles.zoomControls, { backgroundColor: colors.surfaceRaised }]}><Pressable disabled={zoom <= 1} accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => adjustZoom(-0.5)} style={styles.zoomButton}><Ionicons name="remove" size={19} color={zoom <= 1 ? colors.textMuted : colors.text} /></Pressable><Text style={[styles.zoomText, { color: colors.text }]}>{Math.round(zoom * 100)}%</Text><Pressable disabled={zoom >= 4} accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => adjustZoom(0.5)} style={styles.zoomButton}><Ionicons name="add" size={19} color={zoom >= 4 ? colors.textMuted : colors.text} /></Pressable></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close document" hitSlop={10} onPress={close} style={[styles.close, { backgroundColor: colors.surfaceRaised }]}><Ionicons name="close" size={25} color={colors.text} /></Pressable>
        </View>
        {viewer?.loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /><Text style={[styles.status, { color: colors.textMuted }]}>Preparing document…</Text></View> : viewer?.error ? <View style={styles.center}><Ionicons name="document-outline" size={42} color={colors.textMuted} /><Text style={[styles.errorTitle, { color: colors.text }]}>Preview unavailable</Text><Text style={[styles.status, { color: colors.textMuted }]}>{viewer.error}</Text></View> : (
          webSource ? <WebView ref={webViewRef} source={webSource} onMessage={handleWebMessage} containerStyle={styles.webViewer} style={styles.webViewer} showsHorizontalScrollIndicator /> : <View style={styles.center}>{imageError ? <Text style={{ color: colors.text }}>This image could not be opened.</Text> : <ActivityIndicator color={colors.primary} />}</View>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 70, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '900' },
  pageCount: { fontSize: 11, marginTop: 2 },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  zoomControls: { height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center' },
  zoomButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomText: { minWidth: 43, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  errorTitle: { fontSize: 20, fontWeight: '900' },
  status: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  webViewer: { flex: 1, backgroundColor: '#07151A' },
  imageViewer: { flex: 1 },
  pages: { paddingVertical: 14, gap: 14, alignItems: 'center' },
  page: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }
});
