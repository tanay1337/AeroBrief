import { Ionicons } from '@expo/vector-icons';
import { WebView } from '@expo/dom-webview';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DocumentViewerModal, getDocumentImagePage, type DocumentViewerState } from '@/components/DocumentViewerModal';
import { Screen } from '@/components/Screen';
import { StateNotice } from '@/components/StateNotice';
import { getPilotDocumentFiles } from '@/data/pilotDocumentFiles';
import { getPilotDocument } from '@/data/pilotDocuments';
import { createPdfViewer, deletePdfViewer } from '@/data/pdfViewer';
import { DOCUMENT_TYPE_LABELS, documentExpiryStatus, type PilotDocumentFile } from '@/domain/pilotDocuments';
import { useAppTheme } from '@/theme/theme';

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element | null {
  const { colors } = useAppTheme();
  if (!value) return null;
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text><Text selectable style={[styles.detailValue, { color: colors.text }]}>{value}</Text></View>;
}

export default function DocumentViewScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const { colors } = useAppTheme();
  const [viewer, setViewer] = useState<DocumentViewerState | null>(null);
  const document = useQuery({ queryKey: ['pilot-document', id], queryFn: () => getPilotDocument(db, id!), enabled: Boolean(id) });
  const files = useQuery({ queryKey: ['pilot-document-files', id], queryFn: () => getPilotDocumentFiles(db, id!), enabled: Boolean(id) });
  const firstFile = files.data?.[0];
  const firstIsPdf = Boolean(firstFile && (firstFile.mimeType === 'application/pdf' || firstFile.name.toLowerCase().endsWith('.pdf')));
  const topPreview = useQuery({
    queryKey: ['pilot-document-preview', firstFile?.id, firstFile?.uri],
    queryFn: () => createPdfViewer(firstFile!.uri),
    enabled: firstIsPdf,
    retry: false,
    staleTime: 0,
    gcTime: 0
  });

  useEffect(() => () => deletePdfViewer(topPreview.data?.directory ?? null), [topPreview.data?.directory]);

  const openFile = async (file: PilotDocumentFile) => {
    if (file.mimeType.startsWith('image/')) {
      setViewer({ name: file.name, pages: [await getDocumentImagePage(file.uri)], directory: null, loading: false });
      return;
    }
    if (file.id === firstFile?.id && topPreview.data) {
      setViewer({ name: file.name, pages: [], webUri: topPreview.data.viewerUri, directory: topPreview.data.directory, loading: false });
      return;
    }
    setViewer({ name: file.name, pages: [], directory: null, loading: true });
    try {
      const preview = await createPdfViewer(file.uri);
      setViewer({ name: file.name, pages: [], webUri: preview.viewerUri, directory: preview.directory, loading: false });
    } catch (error) {
      setViewer({ name: file.name, pages: [], directory: null, loading: false, error: error instanceof Error ? error.message : 'This document could not be previewed.' });
    }
  };

  const closeViewer = () => {
    if (viewer?.directory && viewer.directory !== topPreview.data?.directory) deletePdfViewer(viewer.directory);
    setViewer(null);
  };

  if (document.isLoading) return <Screen scroll={false}><StateNotice loading title="Loading document" /></Screen>;
  if (document.isError || !document.data) return <Screen scroll={false}><StateNotice title="Document unavailable" body="This pilot document could not be found." /></Screen>;
  const record = document.data;
  const status = documentExpiryStatus(record.expiryDate);
  const showExpiryDetail = status.kind !== 'VALID';

  return (
    <>
      <Stack.Screen options={{
        title: record.title,
        headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Edit document" hitSlop={10} onPress={() => router.push({ pathname: '/document-entry', params: { id: record.id } })}><Ionicons name="create-outline" size={24} color={colors.text} /></Pressable>
      }} />
      <Screen>
        <Pressable disabled={!firstFile} accessibilityRole={firstFile ? 'button' : undefined} accessibilityLabel={firstFile ? `Open ${firstFile.name}` : undefined} onPress={() => firstFile && void openFile(firstFile)} style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {!firstFile ? <View style={styles.previewEmpty}><Ionicons name="document-outline" size={42} color={colors.textMuted} /><Text style={[styles.previewStatus, { color: colors.textMuted }]}>No file attached</Text></View>
            : firstFile.mimeType.startsWith('image/') ? <Image source={{ uri: firstFile.uri }} resizeMode="contain" style={styles.topDocument} />
              : topPreview.isLoading ? <View style={styles.previewEmpty}><ActivityIndicator color={colors.primary} /><Text style={[styles.previewStatus, { color: colors.textMuted }]}>Preparing document…</Text></View>
                : topPreview.data ? <WebView pointerEvents="none" source={{ uri: topPreview.data.previewUri }} containerStyle={styles.topDocument} style={styles.topDocument} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} />
                  : <View style={styles.previewEmpty}><Ionicons name="document-outline" size={42} color={colors.textMuted} /><Text style={[styles.previewStatus, { color: colors.textMuted }]}>Preview unavailable</Text></View>}
          {firstFile ? <View style={[styles.openHint, { backgroundColor: colors.primarySoft }]}><Ionicons name="expand-outline" size={16} color={colors.primary} /><Text style={[styles.openHintText, { color: colors.primary }]}>Open</Text></View> : null}
        </Pressable>

        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroHeading}><View style={styles.heroCopy}><Text style={[styles.title, { color: colors.text }]}>{record.title}</Text><Text style={[styles.type, { color: colors.textMuted }]}>{DOCUMENT_TYPE_LABELS[record.type]}</Text></View><View style={[styles.status, { backgroundColor: status.kind === 'EXPIRED' ? colors.danger : status.kind === 'URGENT' ? colors.warning : colors.primarySoft }]}><Text style={[styles.statusText, { color: status.kind === 'EXPIRED' || status.kind === 'URGENT' ? '#FFFFFF' : colors.primary }]}>{status.label}</Text></View></View>
          <View style={styles.detailsGrid}><Detail label="Document number" value={record.documentNumber} /><Detail label="Issuer" value={record.issuer} /><Detail label="Issue date" value={record.issueDate} />{showExpiryDetail ? <Detail label="Expiry date" value={record.expiryDate} /> : null}</View>
        </View>

        {record.notes ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Notes</Text><Text selectable style={[styles.notes, { color: colors.text }]}>{record.notes}</Text></View> : null}

        {(files.data?.length ?? 0) > 1 ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.filesHeading}><Text style={[styles.cardTitle, { color: colors.text }]}>Attached files</Text><Text style={[styles.fileCount, { color: colors.textMuted }]}>{files.data?.length}</Text></View>{files.data?.map((file) => <Pressable key={file.id} onPress={() => void openFile(file)} style={[styles.fileRow, { borderTopColor: colors.border }]}>{file.mimeType.startsWith('image/') ? <Image source={{ uri: file.uri }} style={styles.thumbnail} /> : <View style={[styles.fileIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-outline" size={21} color={colors.primary} /></View>}<View style={styles.fileCopy}><Text numberOfLines={1} style={[styles.fileName, { color: colors.text }]}>{file.name}</Text><Text style={[styles.fileMeta, { color: colors.textMuted }]}>{Math.max(1, Math.round(file.sizeBytes / 1024))} KB</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>)}</View> : null}

        <Text style={[styles.notice, { color: colors.textMuted }]}>Always carry the originals required for your flight. AeroBrief does not verify document validity.</Text>
        <DocumentViewerModal viewer={viewer} onClose={closeViewer} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: { height: 300, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  topDocument: { width: '100%', height: '100%' },
  previewEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewStatus: { fontSize: 12, fontWeight: '700' },
  openHint: { position: 'absolute', right: 12, bottom: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  openHintText: { fontSize: 10, fontWeight: '900' },
  hero: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 16 },
  heroHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroCopy: { flex: 1 },
  title: { fontSize: 25, fontWeight: '900', letterSpacing: -0.4 },
  type: { fontSize: 12, marginTop: 3 },
  status: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '900' },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail: { width: '48%', minHeight: 48 },
  detailLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  detailValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginTop: 3 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, gap: 10 },
  cardTitle: { fontSize: 19, fontWeight: '900' },
  notes: { fontSize: 13, lineHeight: 20 },
  filesHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  fileCount: { fontSize: 11, fontWeight: '800' },
  fileRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbnail: { width: 42, height: 42, borderRadius: 8 },
  fileIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '800' },
  fileMeta: { fontSize: 10, marginTop: 2 },
  notice: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 }
});
