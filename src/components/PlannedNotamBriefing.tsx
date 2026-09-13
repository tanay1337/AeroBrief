import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DocumentViewerModal, getDocumentImagePage, type DocumentViewerState } from '@/components/DocumentViewerModal';
import { getPlannedFlightAttachments, savePlannedBriefingAttachment, deletePlannedAttachment } from '@/data/plannedFlightAttachments';
import { stagePickedFiles } from '@/data/localFiles';
import { createPdfViewer, deletePdfViewer } from '@/data/pdfViewer';
import type { LogbookAttachment, LogbookAttachmentCategory } from '@/domain/logbook';
import { attachmentAddedAt, briefingAttachmentTitle } from '@/domain/briefingAttachments';
import { DFS_BRIEFING_URL, openInAppBrowser } from '@/navigation/inAppBrowser';
import { useAppTheme } from '@/theme/theme';

export function PlannedNotamBriefing({ flightId }: { flightId: string }): React.JSX.Element {
  return <PlannedBriefingAttachments flightId={flightId} category="NOTAM_BRIEFING" label="NOTAM briefing" icon="document-text-outline" sourceUrl={DFS_BRIEFING_URL} sourceLabel="Open DFS" />;
}
export function PlannedBriefingAttachments({ flightId, category, airportIdent, label, icon, sourceUrl, sourceLabel = 'Official AIP', compact = false, controlsVisible = false }: {
  flightId: string; category: Exclude<LogbookAttachmentCategory, 'GENERAL'>; airportIdent?: string; label: string;
  icon: React.ComponentProps<typeof Ionicons>['name']; sourceUrl?: string; sourceLabel?: string; compact?: boolean; controlsVisible?: boolean;
}): React.JSX.Element {
  const db = useSQLiteContext();
  const client = useQueryClient();
  const { colors } = useAppTheme();
  const files = useQuery({ queryKey: ['planned-flight-attachments', flightId], queryFn: () => getPlannedFlightAttachments(db, flightId) });
  const selectedFiles = (files.data ?? []).filter((file) => file.category === category && (category === 'NOTAM_BRIEFING' || file.airportIdent === airportIdent));
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [viewer, setViewer] = useState<DocumentViewerState | null>(null);
  const previewDirectory = useRef<DocumentViewerState['directory']>(null);
  const previewRequest = useRef(0);
  useEffect(() => () => { previewRequest.current += 1; deletePdfViewer(previewDirectory.current); }, []);
  const closeViewer = () => { previewRequest.current += 1; deletePdfViewer(previewDirectory.current); previewDirectory.current = null; setViewer(null); };
  const openPdf = async (file: LogbookAttachment) => {
    deletePdfViewer(previewDirectory.current); previewDirectory.current = null;
    const request = ++previewRequest.current;
    setViewer({ name: file.name, pages: [], directory: null, loading: true });
    try {
      if (file.mimeType.startsWith('image/')) {
        const page = await getDocumentImagePage(file.uri);
        if (request === previewRequest.current) setViewer({ name: file.name, pages: [page], directory: null, loading: false });
        return;
      }
      const preview = await createPdfViewer(file.uri);
      if (request !== previewRequest.current) { deletePdfViewer(preview.directory); return; }
      previewDirectory.current = preview.directory;
      setViewer({ name: file.name, pages: [], webUri: preview.viewerUri, directory: preview.directory, loading: false });
    } catch (error) {
      if (request === previewRequest.current) setViewer({ name: file.name, pages: [], directory: null, loading: false, error: error instanceof Error ? error.message : 'Could not preview PDF.' });
    }
  };
  const attach = async () => {
    try {
      setPicking(true);
      const result = await File.pickFileAsync({ mimeTypes: category === 'NOTAM_BRIEFING' ? ['application/pdf'] : ['application/pdf', 'image/png', 'image/jpeg'], multipleFiles: false });
      if (result.canceled) return;
      const picked = await stagePickedFiles([result.result], category === 'NOTAM_BRIEFING' ? 'planned-notam' : 'planned-chart');
      for (const file of picked) await savePlannedBriefingAttachment(db, flightId, file, category, airportIdent);
      await client.invalidateQueries({ queryKey: ['planned-flight-attachments', flightId] });
      setExpanded(false);
    } catch (error) { Alert.alert(`Could not attach ${label.toLowerCase()}`, error instanceof Error ? error.message : 'Try choosing the PDF from Downloads.'); }
    finally { setPicking(false); }
  };
  const remove = (file: LogbookAttachment) => Alert.alert('Remove attachment?', 'The file will be removed from this plan. A copy already saved in a flight record remains attached there.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void deletePlannedAttachment(db, file).then(() => client.invalidateQueries({ queryKey: ['planned-flight-attachments', flightId] })).catch(() => Alert.alert('Could not remove PDF', 'Please try again.')) }]);
  const managing = compact ? controlsVisible : expanded;
  const displayTitle = briefingAttachmentTitle(category);
  return <View style={compact ? styles.compactGroup : [styles.group, { borderTopColor: colors.border }]}>
    {!compact && !selectedFiles.length ? <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.text }]}>{label}</Text><Text style={[styles.note, { color: colors.textMuted }]}>{files.isError ? 'Could not load attachments' : 'No PDF attached'}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${label}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.manage}><Ionicons name={expanded ? 'close-outline' : 'ellipsis-horizontal'} size={20} color={colors.primary} /></Pressable>
    </View> : null}
    {selectedFiles.map((file, index) => <View key={file.id} style={[compact ? styles.chartCard : styles.row, compact ? { backgroundColor: colors.surfaceRaised } : undefined]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${file.name}`} onPress={() => void openPdf(file)} style={[styles.file, compact ? { paddingHorizontal: 10 } : undefined]}>
        <Ionicons name={icon} size={compact ? 18 : 20} color={colors.primary} />
        <View style={{ flex: 1 }}><Text numberOfLines={compact && managing ? 2 : 1} style={[compact ? styles.chartTitle : styles.title, { color: colors.text }]}>{displayTitle}{selectedFiles.length > 1 ? ` ${index + 1}` : ''}</Text>
          <Text numberOfLines={1} style={[styles.fileMeta, { color: colors.textMuted }]}>{file.mimeType.startsWith('image/') ? 'Image' : 'PDF'} · Added {compact ? new Date(file.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : attachmentAddedAt(file.createdAt)}</Text></View>
        {!compact ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
      </Pressable>
      {managing ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${file.name}`} onPress={() => remove(file)} style={styles.manage}><Ionicons name="close-outline" size={20} color={colors.textMuted} /></Pressable> : !compact && index === 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${label}`} accessibilityState={{ expanded }} onPress={() => setExpanded(true)} style={styles.manage}><Ionicons name="ellipsis-horizontal" size={20} color={colors.primary} /></Pressable> : null}
    </View>)}
    {managing ? <View style={styles.controls}>
      <View style={styles.actions}>{sourceUrl ? <Pressable accessibilityRole="button" onPress={() => openInAppBrowser(sourceUrl, sourceLabel)} style={[styles.action, { backgroundColor: colors.primarySoft }]}><Ionicons name="open-outline" size={17} color={colors.primary} /><Text style={[styles.actionLabel, { color: colors.primary }]}>{sourceLabel}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" disabled={picking} onPress={() => void attach()} style={[styles.action, { backgroundColor: colors.primarySoft, opacity: picking ? 0.5 : 1 }]}><Ionicons name="attach" size={17} color={colors.primary} /><Text style={[styles.actionLabel, { color: colors.primary }]}>{picking ? 'Opening…' : category === 'NOTAM_BRIEFING' ? 'Attach PDF' : category === 'APPROACH_PLATE' ? 'Add approach plate' : 'Add layout'}</Text></Pressable>
      </View>
      {!compact ? <View style={styles.helpRow}><Text style={[styles.note, { color: colors.textMuted, flex: 1 }]}>Select the downloaded DFS PDF. Check its route and validity.</Text><Pressable accessibilityRole="button" accessibilityLabel="Close NOTAM attachment controls" onPress={() => setExpanded(false)} style={styles.manage}><Ionicons name="chevron-up" size={18} color={colors.primary} /></Pressable></View> : null}
    </View> : null}
    <DocumentViewerModal viewer={viewer} onClose={closeViewer} />
  </View>;
}
const styles = StyleSheet.create({
  group: { borderTopWidth: 1, paddingTop: 8 }, compactGroup: { flexGrow: 1, flexBasis: 135, minWidth: 135, gap: 6 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 14, fontWeight: '800' }, chartTitle: { fontSize: 12, fontWeight: '800' },
  chartCard: { borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  file: { flex: 1, minHeight: 56, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  fileMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 }, note: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  manage: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  controls: { gap: 8, paddingTop: 6 }, actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionLabel: { fontSize: 11, fontWeight: '800' }, helpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }
});
