import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme';

interface StateNoticeProps {
  title: string;
  body?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export function StateNotice({ title, body, loading, actionLabel, onAction, icon = 'cloud-offline-outline' }: StateNoticeProps): React.JSX.Element {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container} accessible accessibilityLabel={`${title}. ${body ?? ''}`}>
      {loading ? <ActivityIndicator color={colors.primary} size="large" /> : <Ionicons name={icon} color={colors.primary} size={38} />}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 280 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 20, marginTop: 18, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 }
});
