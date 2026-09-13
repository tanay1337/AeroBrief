import React from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/theme';

interface ScreenProps extends ScrollViewProps {
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({ scroll = true, contentStyle, children, ...props }: ScreenProps): React.JSX.Element {
  const { colors } = useAppTheme();
  if (!scroll) {
    return <View style={[styles.fill, { backgroundColor: colors.background }, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 14 }
});
