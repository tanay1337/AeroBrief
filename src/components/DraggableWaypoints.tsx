import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, Pressable } from 'react-native';
import { reorderWaypoints } from '@/domain/reorderWaypoints';
import type { RouteWaypoint } from '@/domain/routePlanning';
import { useAppTheme } from '@/theme/theme';


function DragRow({ point, index, count, onDrop, onRemove, onDragging }: {
  point: RouteWaypoint; index: number; count: number;
  onDrop: (from: number, to: number) => void; onRemove: (id: string) => void; onDragging: (dragging: boolean) => void;
}): React.JSX.Element {
  const { colors } = useAppTheme();
  const [offset, setOffset] = useState(0);
  const [active, setActive] = useState(false);
  const current = useRef({ index, count, onDrop, onDragging });
  useEffect(() => { current.current = { index, count, onDrop, onDragging }; }, [index, count, onDrop, onDragging]);
  const [responder, setPan] = useState<ReturnType<typeof PanResponder.create> | null>(null);
  useEffect(() => {
    // Install the gesture responder once, with callbacks reading current state from refs.
    setPan(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { setActive(true); current.current.onDragging(true); },
    onPanResponderMove: (_, gesture) => setOffset(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      const { index: start, count: size, onDrop: drop, onDragging: dragging } = current.current;
      drop(start, Math.max(0, Math.min(size - 1, start + Math.round(gesture.dy / 84))));
      setOffset(0); setActive(false); dragging(false);
    },
    onPanResponderTerminate: () => { setOffset(0); setActive(false); current.current.onDragging(false); },
    onPanResponderTerminationRequest: () => false
  }));
  }, []);
  const destination = Math.max(0, Math.min(count - 1, index + Math.round(offset / 84)));
  return <View style={[styles.row, { backgroundColor: active ? colors.primarySoft : colors.surface, borderColor: active ? colors.primary : colors.border, zIndex: active ? 10 : 0, transform: [{ translateY: offset }] }]}>
    <View {...responder?.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`Reorder waypoint ${index + 1}, ${point.ident}`} accessibilityHint="Drag up or down to reorder" accessibilityActions={[{ name: 'increment', label: 'Move down' }, { name: 'decrement', label: 'Move up' }]} onAccessibilityAction={(event) => onDrop(index, Math.max(0, Math.min(count - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))} style={styles.handle}><Ionicons name="reorder-three-outline" size={25} color={colors.textMuted} /></View>
    <View style={[styles.number, { backgroundColor: colors.primary }]}><Text style={styles.numberText}>{index + 1}</Text></View>
    <View style={{ flex: 1 }}><Text style={[styles.ident, { color: colors.text }]}>{point.ident}</Text><Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>{active ? `Move to position ${destination + 1}` : point.name}</Text></View>
    <Pressable accessibilityLabel={`Remove waypoint ${point.ident}`} hitSlop={8} onPress={() => onRemove(point.id)}><Ionicons name="close" size={20} color={colors.danger} /></Pressable>
  </View>;
}
export function DraggableWaypoints({ waypoints, onChange, onDragging }: { waypoints: RouteWaypoint[]; onChange: (points: RouteWaypoint[]) => void; onDragging: (dragging: boolean) => void }): React.JSX.Element {
  return <View style={{ gap: 12 }}>{waypoints.map((point, index) => <DragRow key={point.id} point={point} index={index} count={waypoints.length} onDrop={(from, to) => onChange(reorderWaypoints(waypoints, from, to))} onRemove={(id) => onChange(waypoints.filter((item) => item.id !== id))} onDragging={onDragging} />)}</View>;
}
const styles = StyleSheet.create({
  row: { height: 72, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingRight: 14, gap: 9 },
  handle: { width: 38, height: 70, alignItems: 'center', justifyContent: 'center' },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 }, ident: { fontSize: 15, fontWeight: '800', marginBottom: 4 }
});
