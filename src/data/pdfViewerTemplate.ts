import { DOCUMENT_ZOOM_SCRIPT } from '@/data/documentZoomScript';

export function buildPdfViewerHtml(preview: boolean): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: #07151a; color: #a9bcc3; font-family: system-ui, sans-serif; }
    #viewport { position: fixed; inset: 0; overflow: auto; overflow-anchor: none; overscroll-behavior: contain; touch-action: pan-x pan-y; }
    body.preview { height: 100vh; overflow: hidden; }
    #status { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; text-align: center; font-size: 13px; z-index: 2; }
    #pages { display: flex; flex-direction: column; align-items: center; gap: 14px; width: max-content; min-width: 100%; padding: 12px; }
    .page-shell { flex: none; background: white; box-shadow: 0 1px 5px rgba(0,0,0,.35); }
    canvas { display: block; width: 100%; height: 100%; background: white; }
    .preview #pages { width: 100vw; height: 100vh; padding: 8px; justify-content: center; }
    .preview .page-shell { max-width: 100%; max-height: 100%; box-shadow: none; }
    .error { color: #d9e5e8; font-weight: 700; line-height: 1.5; }
  </style>
</head>
<body class="${preview ? 'preview' : 'viewer'}">
  <div id="status">Opening PDF…</div>
  <div id="viewport"><main id="pages"></main></div>
  <script src="./pdf.min.js"></script>
  <script src="./pdf.worker.min.js"></script>
  <script>
    ${DOCUMENT_ZOOM_SCRIPT}
    (async function () {
      const status = document.getElementById('status');
      const pages = document.getElementById('pages');
      const viewportElement = document.getElementById('viewport');
      const records = [];
      let zoom = 1;
      let renderTimer = 0;

      function nearViewport(record) {
        const bounds = record.shell.getBoundingClientRect();
        return bounds.bottom > -window.innerHeight && bounds.top < window.innerHeight * 2;
      }

      function safeRenderScale(record, targetZoom) {
        const density = Math.max(1.5, Math.min(3, window.devicePixelRatio || 1));
        const desired = record.cssScale * targetZoom * density;
        const width = record.base.width * desired;
        const height = record.base.height * desired;
        const dimensionLimit = Math.min(1, 6144 / Math.max(width, height));
        const areaLimit = Math.min(1, Math.sqrt(18000000 / Math.max(1, width * height)));
        return desired * Math.min(dimensionLimit, areaLimit);
      }

      async function renderRecord(record, targetZoom) {
        if (record.renderedZoom >= targetZoom - .04) return;
        if (record.task) {
          record.task.cancel();
          try { await record.task.promise; } catch (_) {}
        }
        const viewport = record.page.getViewport({ scale: safeRenderScale(record, targetZoom) });
        record.canvas.width = Math.ceil(viewport.width);
        record.canvas.height = Math.ceil(viewport.height);
        record.task = record.page.render({ canvasContext: record.canvas.getContext('2d'), viewport: viewport });
        try {
          await record.task.promise;
          record.renderedZoom = targetZoom;
        } catch (error) {
          if (!error || error.name !== 'RenderingCancelledException') throw error;
        } finally {
          record.task = null;
        }
      }

      function renderVisibleSoon() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(async () => {
          for (const record of records) {
            if (nearViewport(record)) await renderRecord(record, zoom);
          }
        }, 140);
      }

      function reportZoom() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'zoom', value: zoom }));
      }

      function setZoom(next, sharpen, notify) {
        zoom = Math.min(4, Math.max(1, next));
        records.forEach((record) => {
          record.shell.style.width = Math.round(record.baseWidth * zoom) + 'px';
          record.shell.style.height = Math.round(record.baseHeight * zoom) + 'px';
        });
        if (sharpen !== false) renderVisibleSoon();
        if (notify !== false) reportZoom();
      }

      installDocumentZoom(viewportElement, records, () => zoom, (next) => setZoom(next, false, false), reportZoom, renderVisibleSoon);
      if (Number.isFinite(window.__aeroBriefRequestedZoom)) setZoom(window.__aeroBriefRequestedZoom, false, false);

      try {
        const pdf = await pdfjsLib.getDocument('./document.pdf').promise;
        const lastPage = ${preview ? 'Math.min(1, pdf.numPages)' : 'pdf.numPages'};
        for (let number = 1; number <= lastPage; number += 1) {
          const page = await pdf.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(240, window.innerWidth - ${preview ? '16' : '24'});
          const cssScale = ${preview ? 'Math.min(availableWidth / base.width, Math.max(1, window.innerHeight - 16) / base.height)' : 'availableWidth / base.width'};
          const shell = document.createElement('section');
          const canvas = document.createElement('canvas');
          const record = {
            page: page,
            base: base,
            cssScale: cssScale,
            baseWidth: Math.round(base.width * cssScale),
            baseHeight: Math.round(base.height * cssScale),
            shell: shell,
            canvas: canvas,
            renderedZoom: 0,
            task: null
          };
          shell.className = 'page-shell';
          shell.style.width = Math.round(record.baseWidth * zoom) + 'px';
          shell.style.height = Math.round(record.baseHeight * zoom) + 'px';
          shell.appendChild(canvas);
          pages.appendChild(shell);
          records.push(record);
          await renderRecord(record, zoom);
        }
        reportZoom();
        status.remove();
      } catch (error) {
        status.className = 'error';
        status.textContent = error && error.name === 'PasswordException'
          ? 'This PDF is password-protected.'
          : 'This PDF could not be displayed. The file may be damaged or use an unsupported security setting.';
      }
    })();
  </script>
</body>
</html>`;
}
