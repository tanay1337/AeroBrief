import { Directory, File, Paths } from 'expo-file-system';
import { buildPdfViewerHtml } from '@/data/pdfViewerTemplate';
import { PDFJS_SOURCE, PDFJS_WORKER_SOURCE } from '@/vendor/pdfjsScripts.generated';

export interface PdfViewerResult {
  viewerUri: string;
  previewUri: string;
  directory: Directory;
}

export async function createPdfViewer(uri: string): Promise<PdfViewerResult> {
  const directory = new Directory(Paths.cache, `aerobrief-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  directory.create({ intermediates: true, idempotent: true });
  try {
    await new File(uri).copy(new File(directory, 'document.pdf'), { overwrite: true });
    const pdfScript = new File(directory, 'pdf.min.js');
    const workerScript = new File(directory, 'pdf.worker.min.js');
    const viewer = new File(directory, 'viewer.html');
    const preview = new File(directory, 'preview.html');
    pdfScript.write(PDFJS_SOURCE);
    workerScript.write(PDFJS_WORKER_SOURCE);
    viewer.write(buildPdfViewerHtml(false));
    preview.write(buildPdfViewerHtml(true));
    return { viewerUri: viewer.uri, previewUri: preview.uri, directory };
  } catch (error) {
    if (directory.exists) directory.delete();
    throw error;
  }
}

export function deletePdfViewer(directory: Directory | null): void {
  if (directory?.exists) directory.delete();
}
