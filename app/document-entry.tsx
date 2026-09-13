import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DocumentViewerModal, getDocumentImagePage, type DocumentViewerState } from '@/components/DocumentViewerModal';
import { Screen } from '@/components/Screen';
import { deletePilotDocumentFile, getPilotDocumentFiles, savePilotDocumentFiles } from '@/data/pilotDocumentFiles';
import { deletePilotDocument, getPilotDocument, savePilotDocument } from '@/data/pilotDocuments';
import { stagePickedFiles } from '@/data/localFiles';
import { createPdfViewer, deletePdfViewer } from '@/data/pdfViewer';
import { DOCUMENT_TYPE_LABELS, isIsoDateOrBlank, type PendingPilotDocumentFile, type PilotDocumentFile, type PilotDocumentInput, type PilotDocumentType } from '@/domain/pilotDocuments';
import { useAppTheme } from '@/theme/theme';
import type { AppColors } from '@/theme/theme';

type FormState = Record<'title' | 'documentNumber' | 'issuer' | 'issueDate' | 'expiryDate' | 'notes', string>;

const TYPES: PilotDocumentType[] = ['IDENTITY', 'MEDICAL', 'SECURITY_CLEARANCE', 'PILOT_LICENCE', 'OTHER'];

function DocumentField({ name, label, placeholder, multiline = false, form, onChange, colors }: {
  name: keyof FormState;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  form: FormState;
  onChange: (key: keyof FormState, value: string) => void;
  colors: AppColors;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={form[name]}
        onChangeText={(value) => onChange(name, value)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={name === 'notes' ? 'sentences' : 'words'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multiline, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      />
    </View>
  );
}

export default function DocumentEntryScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const [type, setType] = useState<PilotDocumentType>('IDENTITY');
  const [form, setForm] = useState<FormState>({ title: DOCUMENT_TYPE_LABELS.IDENTITY, documentNumber: '', issuer: '', issueDate: '', expiryDate: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [pickingFiles, setPickingFiles] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingPilotDocumentFile[]>([]);
  const [viewer, setViewer] = useState<DocumentViewerState | null>(null);
  const existing = useQuery({ queryKey: ['pilot-document', id], queryFn: () => getPilotDocument(db, id!), enabled: Boolean(id) });
  const files = useQuery({ queryKey: ['pilot-document-files', id], queryFn: () => getPilotDocumentFiles(db, id!), enabled: Boolean(id) });

  useEffect(() => {
    const document = existing.data;
    if (!document) return;
    // Populate the draft once the local record has loaded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setType(document.type);
    setForm({
      title: document.title,
      documentNumber: document.documentNumber,
      issuer: document.issuer,
      issueDate: document.issueDate,
      expiryDate: document.expiryDate,
      notes: document.notes
    });
  }, [existing.data]);

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const selectType = (nextType: PilotDocumentType) => {
    setType(nextType);
    setForm((current) => ({
      ...current,
      title: TYPES.some((candidate) => current.title === DOCUMENT_TYPE_LABELS[candidate]) ? DOCUMENT_TYPE_LABELS[nextType] : current.title
    }));
  };

  const chooseFiles = async () => {
    try {
      setPickingFiles(true);
      const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['image/*', 'application/pdf'] });
      if (picked.canceled) return;
      const staged = await stagePickedFiles(picked.result, 'pilot-document');
      setPendingFiles((current) => [...current, ...staged]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected files could not be read.';
      if (!/cancel/i.test(message)) Alert.alert('Could not add file', message);
    } finally {
      setPickingFiles(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert('Add a title', 'Give this document a recognizable title.');
      return;
    }
    if (!isIsoDateOrBlank(form.issueDate.trim()) || !isIsoDateOrBlank(form.expiryDate.trim())) {
      Alert.alert('Check the dates', 'Use YYYY-MM-DD for issue and expiry dates, or leave the field blank.');
      return;
    }
    const input: PilotDocumentInput = {
      id,
      type,
      title: form.title.trim(),
      documentNumber: form.documentNumber.trim(),
      issuer: form.issuer.trim(),
      issueDate: form.issueDate.trim(),
      expiryDate: form.expiryDate.trim(),
      notes: form.notes.trim()
    };
    try {
      setSaving(true);
      const savedId = await savePilotDocument(db, input);
      await savePilotDocumentFiles(db, savedId, pendingFiles);
      await queryClient.invalidateQueries({ queryKey: ['pilot-documents'] });
      await queryClient.invalidateQueries({ queryKey: ['pilot-document', savedId] });
      await queryClient.invalidateQueries({ queryKey: ['pilot-document-files', savedId] });
      router.back();
    } catch (error) {
      Alert.alert('Could not save document', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeFile = (fileRecord: PilotDocumentFile) => {
    Alert.alert('Remove file?', fileRecord.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void deletePilotDocumentFile(db, fileRecord).then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['pilot-document-files', id] });
      }) }
    ]);
  };

  const removePendingFile = (fileRecord: PendingPilotDocumentFile) => {
    const file = new File(fileRecord.uri);
    if (file.parentDirectory.exists) file.parentDirectory.delete();
    setPendingFiles((current) => current.filter((item) => item.uri !== fileRecord.uri));
  };

  const openFile = async (fileRecord: PilotDocumentFile) => {
    if (fileRecord.mimeType.startsWith('image/')) {
      setViewer({ name: fileRecord.name, pages: [await getDocumentImagePage(fileRecord.uri)], directory: null, loading: false });
      return;
    }
    setViewer({ name: fileRecord.name, pages: [], directory: null, loading: true });
    try {
      const preview = await createPdfViewer(fileRecord.uri);
      setViewer({ name: fileRecord.name, pages: [], webUri: preview.viewerUri, directory: preview.directory, loading: false });
    } catch (error) {
      setViewer({ name: fileRecord.name, pages: [], directory: null, loading: false, error: error instanceof Error ? error.message : 'This document could not be previewed.' });
    }
  };

  const closeViewer = () => {
    deletePdfViewer(viewer?.directory ?? null);
    setViewer(null);
  };

  const removeDocument = () => {
    if (!id) return;
    Alert.alert('Delete document?', 'The record and its stored files will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deletePilotDocument(db, id).then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['pilot-documents'] });
        router.replace('/documents');
      }) }
    ]);
  };

  const fieldProps = { form, onChange: update, colors };

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit document' : 'Add document' }} />
      <Screen>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Document type</Text>
          <View style={styles.options}>
            {TYPES.map((option) => (
              <Pressable key={option} onPress={() => selectType(option)} style={[styles.chip, { backgroundColor: type === option ? colors.primary : colors.surfaceRaised }]}>
                <Text style={[styles.chipText, { color: type === option ? '#FFFFFF' : colors.text }]}>{DOCUMENT_TYPE_LABELS[option]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
          <DocumentField {...fieldProps} name="title" label="Title" placeholder="Class 2 medical" />
          <DocumentField {...fieldProps} name="documentNumber" label="Document or reference number" placeholder="Optional" />
          <DocumentField {...fieldProps} name="issuer" label="Issuer" placeholder="Authority or organization" />
          <View style={styles.dateRow}>
            <View style={styles.dateField}><DocumentField {...fieldProps} name="issueDate" label="Issue date" placeholder="YYYY-MM-DD" /></View>
            <View style={styles.dateField}><DocumentField {...fieldProps} name="expiryDate" label="Expiry date" placeholder="YYYY-MM-DD" /></View>
          </View>
          <Text style={[styles.help, { color: colors.textMuted }]}>Leave the expiry date blank for documents that do not expire.</Text>
          <DocumentField {...fieldProps} name="notes" label="Notes" placeholder="Optional notes" multiline />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.fileHeading}>
            <View style={styles.fileHeadingCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Files</Text>
              <Text style={[styles.help, { color: colors.textMuted }]}>Add photos or PDFs. Multiple files are supported.</Text>
            </View>
            <Pressable disabled={pickingFiles} accessibilityRole="button" accessibilityLabel="Add document files" onPress={() => void chooseFiles()} style={[styles.addFile, { borderColor: colors.primary }]}>
              <Text style={[styles.addFileText, { color: colors.primary }]}>{pickingFiles ? 'Opening...' : 'Add'}</Text>
            </Pressable>
          </View>
          {files.data?.map((fileRecord) => (
            <View key={fileRecord.id} style={[styles.fileRow, { borderTopColor: colors.border }]}>
              {fileRecord.mimeType.startsWith('image/') ? <Image source={{ uri: fileRecord.uri }} style={styles.thumbnail} /> : <View style={[styles.fileIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="document-outline" size={22} color={colors.primary} /></View>}
              <Pressable style={styles.fileName} onPress={() => void openFile(fileRecord)}>
                <Text numberOfLines={2} style={[styles.fileTitle, { color: colors.text }]}>{fileRecord.name}</Text>
                <Text style={[styles.help, { color: colors.textMuted }]}>{Math.max(1, Math.round(fileRecord.sizeBytes / 1024))} KB</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${fileRecord.name}`} hitSlop={8} onPress={() => removeFile(fileRecord)}><Text style={[styles.removeFile, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          ))}
          {pendingFiles.map((fileRecord) => (
            <View key={fileRecord.uri} style={[styles.fileRow, { borderTopColor: colors.border }]}>
              {fileRecord.mimeType.startsWith('image/') ? <Image source={{ uri: fileRecord.uri }} style={styles.thumbnail} /> : <View style={[styles.fileIcon, { backgroundColor: colors.primarySoft }]}><Text style={[styles.newFile, { color: colors.primary }]}>NEW</Text></View>}
              <View style={styles.fileName}><Text numberOfLines={2} style={[styles.fileTitle, { color: colors.text }]}>{fileRecord.name}</Text><Text style={[styles.help, { color: colors.textMuted }]}>Will be stored when saved</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${fileRecord.name}`} hitSlop={8} onPress={() => removePendingFile(fileRecord)}><Text style={[styles.removeFile, { color: colors.danger }]}>Remove</Text></Pressable>
            </View>
          ))}
          {!files.data?.length && !pendingFiles.length ? <Text style={[styles.emptyFiles, { color: colors.textMuted }]}>No files attached yet.</Text> : null}
        </View>

        <View style={[styles.localNotice, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.primary} />
          <Text style={[styles.localNoticeText, { color: colors.text }]}>Stored locally on this device. Use your device lock and keep the original documents in a safe place.</Text>
        </View>

        <Pressable disabled={saving} onPress={() => void save()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: saving || pressed ? 0.7 : 1 }]}>
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save document'}</Text>
        </Pressable>
        {id ? <Pressable onPress={removeDocument} style={[styles.delete, { borderColor: colors.danger }]}><Text style={[styles.deleteText, { color: colors.danger }]}>Delete document</Text></Pressable> : null}
        <DocumentViewerModal viewer={viewer} onClose={closeViewer} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 21, padding: 16, gap: 13 },
  sectionTitle: { fontSize: 21, fontWeight: '900' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, minHeight: 38, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11, fontWeight: '900' },
  field: { width: '100%', gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { minHeight: 47, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, fontWeight: '700' },
  multiline: { minHeight: 92, paddingTop: 12 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  help: { fontSize: 11, lineHeight: 16 },
  fileHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  fileHeadingCopy: { flex: 1 },
  addFile: { minWidth: 58, minHeight: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  addFileText: { fontSize: 12, fontWeight: '900' },
  fileRow: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
  thumbnail: { width: 46, height: 46, borderRadius: 9 },
  fileIcon: { width: 46, height: 46, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  newFile: { fontSize: 9, fontWeight: '900' },
  fileName: { flex: 1 },
  fileTitle: { fontSize: 13, fontWeight: '800' },
  removeFile: { fontSize: 11, fontWeight: '900' },
  emptyFiles: { fontSize: 12, paddingVertical: 6 },
  localNotice: { borderRadius: 16, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  localNoticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  save: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  delete: { minHeight: 48, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '900' }
});
