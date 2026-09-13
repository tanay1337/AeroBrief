import { DOCUMENT_ZOOM_SCRIPT } from '@/data/documentZoomScript';

export function buildImageViewerHtml(pages: { filename: string; aspectRatio: number }[]): string {
  const data = JSON.stringify(pages).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
  html,body{margin:0;background:#07151a}#viewport{position:fixed;inset:0;overflow:auto;overflow-anchor:none;overscroll-behavior:contain;touch-action:pan-x pan-y}#pages{display:flex;flex-direction:column;align-items:center;gap:14px;padding:14px;width:max-content;min-width:100%;box-sizing:border-box}img{display:block;flex:none;object-fit:contain;background:white}
  </style></head><body><div id="viewport"><main id="pages"></main></div><script>
  ${DOCUMENT_ZOOM_SCRIPT}
  var zoom=1,records=[],viewport=document.getElementById('viewport');
  var width=Math.max(240,window.innerWidth-28);
  ${data}.forEach(function(page){var shell=document.createElement('img');shell.src=page.filename;shell.alt='Document image';shell.style.width=width+'px';shell.style.height=(width/page.aspectRatio)+'px';document.getElementById('pages').appendChild(shell);records.push({shell:shell,baseWidth:width,baseHeight:width/page.aspectRatio});});
  function report(){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'zoom',value:zoom}));}
  installDocumentZoom(viewport,records,function(){return zoom;},function(next){zoom=next;records.forEach(function(r){r.shell.style.width=(r.baseWidth*zoom)+'px';r.shell.style.height=(r.baseHeight*zoom)+'px';});},report,function(){});
  report();
  </script></body></html>`;
}
