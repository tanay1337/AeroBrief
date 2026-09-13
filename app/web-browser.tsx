import { Ionicons } from '@expo/vector-icons';
import { WebView, type DomWebViewRef } from '@expo/dom-webview';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme';

export default function WebBrowserScreen(): React.JSX.Element {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  const webView = useRef<DomWebViewRef>(null);
  const { colors } = useAppTheme();
  const validUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;

  return (
    <>
      <Stack.Screen options={{
        title: typeof title === 'string' && title.trim() ? title : 'Official website',
        headerRight: validUrl ? () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Reload page" hitSlop={10} onPress={() => webView.current?.reload()}>
            <Ionicons name="refresh" size={22} color={colors.text} />
          </Pressable>
        ) : undefined
      }} />
      {validUrl
        ? <WebView ref={webView} source={{ uri: validUrl }} containerStyle={styles.webView} style={styles.webView} showsHorizontalScrollIndicator={false} />
        : <View style={[styles.invalid, { backgroundColor: colors.background }]}><Ionicons name="warning-outline" size={34} color={colors.warning} /><Text style={[styles.invalidTitle, { color: colors.text }]}>Website unavailable</Text><Text style={[styles.invalidBody, { color: colors.textMuted }]}>This link could not be opened safely.</Text></View>}
    </>
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1 },
  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  invalidTitle: { fontSize: 20, fontWeight: '900', marginTop: 12 },
  invalidBody: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 }
});
