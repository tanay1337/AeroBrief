import { buildAeronauticalMapHtml } from '@/data/aeronauticalMapHtml';

describe('OpenFlightMaps map surface', () => {
  const html = buildAeronauticalMapHtml('2609', true);

  it('bundles its map renderer without a CDN dependency', () => {
    expect(html).toContain('L.map(');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
  });

  it('uses only the selected OpenFlightMaps chart layers', () => {
    expect(html).toContain('path=2609/base/latest');
    expect(html).toContain('path=2609/aero/latest');
    expect(html).toContain('open flightmaps association');
    expect(html).toContain('tileSize:256');
    expect(html).toContain('CHART_NATIVE_MAX_ZOOM=11');
    expect(html).toContain('CHART_USEFUL_MAX_ZOOM=13');
    expect(html).not.toContain('maplibregl');
    expect(html).toContain('maxNativeZoom:CHART_NATIVE_MAX_ZOOM');
    expect(html).toContain("pane:'aeroPane'");
    expect(html).toContain('zoomAnimation:true');
    expect(html).toContain('maxZoom:CHART_USEFUL_MAX_ZOOM');
    expect(html).toContain('bounceAtZoomLimits:false');
    expect(html).not.toContain('nextDetailMode');
    expect(html).not.toContain('enroute-data.akaflieg-freiburg.de');
    expect(html).not.toContain('openAIP');
    expect(html).toContain("var useSatellite=baseLayerName==='satellite'");
  });

  it('exposes the route and long-press bridge', () => {
    expect(html).toContain('window.setAeroBriefRoute');
    expect(html).toContain('window.fitAeroBriefRoute');
    expect(html).toContain("type:'longPress'");
    expect(html).toContain("type:'mapPress'");
  });
});
