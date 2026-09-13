import { buildPdfViewerHtml } from '@/data/pdfViewerTemplate';

describe('in-app PDF viewer', () => {
  it('renders the original PDF with PDF.js rather than extracting scan images', () => {
    const html = buildPdfViewerHtml(false);
    expect(html).toContain("pdfjsLib.getDocument('./document.pdf')");
    expect(html).toContain('pdf.numPages');
    expect(html).toContain('page.getViewport({ scale: 1 })');
    expect(html).toContain('window.setAeroBriefZoom');
    expect(html).toContain("type: 'zoom', value: zoom");
    expect(html).toContain('event.touches.length!==2');
    expect(html).not.toContain('id="zoom-in"');
    expect(html).not.toContain('EXIF');
  });

  it('limits the record preview to the first page', () => {
    const html = buildPdfViewerHtml(true);
    expect(html).toContain('Math.min(1, pdf.numPages)');
    expect(html).toContain('body class="preview"');
    expect(html).not.toContain('id="zoom"');
  });
});
