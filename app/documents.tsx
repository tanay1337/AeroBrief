import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getPilotDocuments } from '@/data/pilotDocuments';
import { DOCUMENT_TYPE_LABELS, documentExpiryStatus, type DocumentExpiryKind, type PilotDocument } from '@/domain/pilotDocuments';
import { useAppTheme } from '@/theme/theme';
import type { AppColors } from '@/theme/theme';

const statusRank: Record<DocumentExpiryKind, number> = {
  EXPIRED: 0,
  URGENT: 1,
  UPCOMING: 2,
  VALID: 3,
  NO_EXPIRY: 4
};

function statusColors(kind: DocumentExpiryKind, colors: AppColors): { background: string; foreground: string } {
  if (kind === 'EXPIRED') return { background: colors.danger, foreground: '#FFFFFF' };
  if (kind === 'URGENT') return { background: colors.warning, foreground: '#FFFFFF' };
  if (kind === 'UPCOMING') return { background: colors.primarySoft, foreground: colors.primary };
  if (kind === 'VALID') return { background: '#D8F3E5', foreground: '#08633B' };
  return { background: colors.surfaceRaised, foreground: colors.textMuted };
}

function documentIcon(document: PilotDocument): React.ComponentProps<typeof Ionicons>['name'] {
  if (document.type === 'IDENTITY') return 'id-card-outline';
  if (document.type === 'MEDICAL') return 'medkit-outline';
  if (document.type === 'SECURITY_CLEARANCE') return 'shield-checkmark-outline';
  if (document.type === 'PILOT_LICENCE') return 'airplane-outline';
  return 'document-text-outline';
}

export default function DocumentsScreen(): React.JSX.Element {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const documents = useQuery({ queryKey: ['pilot-documents'], queryFn: () => getPilotDocuments(db) });

  useFocusEffect(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['pilot-documents'] });
  }, [queryClient]));

  const entries = useMemo(() => (documents.data ?? []).slice().sort((left, right) => {
    const leftStatus = documentExpiryStatus(left.expiryDate);
    const rightStatus = documentExpiryStatus(right.expiryDate);
    const rankDifference = statusRank[leftStatus.kind] - statusRank[rightStatus.kind];
    if (rankDifference !== 0) return rankDifference;
    return (left.expiryDate || '9999').localeCompare(right.expiryDate || '9999') || left.title.localeCompare(right.title);
  }), [documents.data]);
  return (
    <>
      <Stack.Screen options={{
        title: 'Pilot documents',
        headerRight: () => (
          <Pressable accessibilityRole="button" accessibilityLabel="Add pilot document" hitSlop={10} onPress={() => router.push('/document-entry')}>
            <Ionicons name="add-circle-outline" size={26} color={colors.text} />
          </Pressable>
        )
      }} />
      <Screen>
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.text }]}>Ready at a glance</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Keep important documents together and see approaching expiry dates.</Text>
        </View>

        {documents.isLoading ? <StateNotice loading title="Loading documents" /> : documents.isError ? (
          <StateNotice title="Documents unavailable" body="The local document database could not be opened." actionLabel="Try again" onAction={() => void documents.refetch()} />
        ) : entries.length === 0 ? (
          <StateNotice icon="document-text-outline" title="No pilot documents yet" body="Add an ID, medical certificate, security clearance, or pilot licence to track its expiry date." actionLabel="Add document" onAction={() => router.push('/document-entry')} />
        ) : (
          <View style={styles.list}>
            <View style={styles.listHeading}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your documents</Text>
              <Text style={[styles.count, { color: colors.textMuted }]}>{entries.length} item{entries.length === 1 ? '' : 's'}</Text>
            </View>
            {entries.map((document) => {
              const status = documentExpiryStatus(document.expiryDate);
              const pill = statusColors(status.kind, colors);
              return (
                <Pressable
                  key={document.id}
                  onPress={() => router.push({ pathname: '/document-view', params: { id: document.id } })}
                  style={({ pressed }) => [styles.documentCard, { backgroundColor: colors.surface, borderColor: status.kind === 'EXPIRED' ? colors.danger : colors.border, opacity: pressed ? 0.75 : 1 }]}
                >
                  <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name={documentIcon(document)} size={23} color={colors.primary} />
                  </View>
                  <View style={styles.documentCopy}>
                    <Text style={[styles.documentTitle, { color: colors.text }]}>{document.title}</Text>
                    <Text style={[styles.documentType, { color: colors.textMuted }]}>{DOCUMENT_TYPE_LABELS[document.type]}{document.issuer ? ` · ${document.issuer}` : ''}</Text>
                    <View style={[styles.statusPill, { backgroundColor: pill.background }]}>
                      <Text style={[styles.statusText, { color: pill.foreground }]}>{status.label}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={[styles.notice, { color: colors.textMuted }]}>Always carry the originals required for your flight. AeroBrief does not verify document validity.</Text>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: 2 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  list: { gap: 10 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  sectionTitle: { fontSize: 22, fontWeight: '900' },
  count: { fontSize: 11, fontWeight: '700' },
  documentCard: { minHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { flex: 1, alignItems: 'flex-start' },
  documentTitle: { fontSize: 17, fontWeight: '900' },
  documentType: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8 },
  statusText: { fontSize: 10, fontWeight: '900' },
  notice: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 6 }
});
