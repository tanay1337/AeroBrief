/// <reference types="node" />
import { runInNewContext } from 'node:vm';
import { buildAeronauticalMapHtml } from '@/data/aeronauticalMapHtml';

function harness() {
  const layers = new Set<unknown>();
  const handlers: Record<string, () => void> = {};
  let zoom = 10; let maxZoom = 13;
  const map = {
    attributionControl: { setPrefix: jest.fn(), addAttribution: jest.fn() },
    setView: () => map, createPane: jest.fn(), getPane: () => ({ style: {} }),
    hasLayer: (layer: unknown) => layers.has(layer), removeLayer: jest.fn((layer: unknown) => layers.delete(layer)),
    getZoom: () => zoom, getMaxZoom: () => maxZoom,
    setMaxZoom: jest.fn((limit: number) => { maxZoom = limit; zoom = Math.min(zoom, limit); }),
    on: (name: string, callback: () => void) => { handlers[name] = callback; }
  };
  const layer = () => {
    const item = { addTo: jest.fn(), on: jest.fn(), bringToFront: jest.fn(), bringToBack: jest.fn(), clearLayers: jest.fn(), setUrl: jest.fn() };
    item.addTo.mockImplementation(() => { layers.add(item); return item; });
    return item;
  };
  const tiles: { url: string; layer: ReturnType<typeof layer> }[] = [];
  const messages: Record<string, unknown>[] = [];
  const markerLabels: string[] = [];
  const window = { ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) }, addEventListener: jest.fn() };
  const html = buildAeronauticalMapHtml('2609', false);
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  runInNewContext(script, {
    window, document: { createElement: () => ({ textContent: '', get innerHTML() { return this.textContent; } }) },
    setInterval: jest.fn(), clearInterval: jest.fn(),
    L: { map: () => map, tileLayer: (url: string) => { const item = layer(); tiles.push({ url, layer: item }); return item; }, featureGroup: layer,
      polyline: layer, divIcon: (options: { html: string }) => options,
      marker: (_position: unknown, options: { icon: { html: string } }) => { markerLabels.push(options.icon.html); return layer(); } }
  });
  return {
    api: window as typeof window & { setAeroBriefBaseLayer: (layer: string) => void; setAeroBriefLayerVisible: (visible: boolean) => void; setAeroBriefRoute: (points: { latitude: number; longitude: number }[]) => void; refreshAeroBriefTiles: () => void },
    zoomTo: (value: number) => { zoom = Math.min(value, maxZoom); handlers.zoomend?.(); },
    maxZoom: () => maxZoom, map, layers, tiles, messages, markerLabels
  };
}

describe('executed map layer behavior', () => {
  it('keeps the selected chart and raster overlay through zoom attempts', () => {
    const h = harness();
    h.zoomTo(19);
    expect(h.maxZoom()).toBe(13);
    expect(h.layers.has(h.tiles[0]!.layer)).toBe(true);
    expect(h.layers.has(h.tiles[1]!.layer)).toBe(false);
    expect(h.layers.has(h.tiles[2]!.layer)).toBe(true);
    expect(h.messages.at(-1)?.atDetailLimit).toBe(true);
  });

  it('leaves tile layers and their DOM order alone during repeated zoom gestures', () => {
    const h = harness();
    const counts = h.tiles.map(({ layer }) => layer.addTo.mock.calls.length);
    for (const zoom of [11, 12, 10, 13, 9, 12]) h.zoomTo(zoom);
    expect(h.map.removeLayer).not.toHaveBeenCalled();
    expect(h.map.setMaxZoom).not.toHaveBeenCalled();
    expect(h.tiles.map(({ layer }) => layer.addTo.mock.calls.length)).toEqual(counts);
    for (const { layer } of h.tiles) {
      expect(layer.bringToFront).not.toHaveBeenCalled(); expect(layer.bringToBack).not.toHaveBeenCalled();
      expect(layer.setUrl).not.toHaveBeenCalled();
    }
  });

  it('keeps the OFM overlay on Satellite through zoom 13, and needs an explicit overlay toggle for zoom 19', () => {
    const h = harness();
    h.api.setAeroBriefBaseLayer('satellite');
    expect(h.maxZoom()).toBe(13);
    h.api.setAeroBriefLayerVisible(false);
    h.zoomTo(19);
    expect(h.maxZoom()).toBe(19);
    expect(h.layers.has(h.tiles[1]!.layer)).toBe(true);
    h.api.setAeroBriefLayerVisible(true);
    expect(h.maxZoom()).toBe(13);
    expect(h.layers.has(h.tiles[2]!.layer)).toBe(true);
    expect(h.layers.has(h.tiles[1]!.layer)).toBe(true);
  });

  it('returns from Satellite to both original OFM chart layers without fetching third-party geometry', () => {
    const h = harness();
    h.api.setAeroBriefBaseLayer('satellite');
    h.api.setAeroBriefBaseLayer('chart');
    h.zoomTo(19);
    expect(h.maxZoom()).toBe(13);
    expect(h.layers.has(h.tiles[0]!.layer)).toBe(true);
    expect(h.layers.has(h.tiles[1]!.layer)).toBe(false);
    expect(h.layers.has(h.tiles[2]!.layer)).toBe(true);
    expect(h.tiles[0]!.url).toContain('base/latest');
    expect(h.messages.at(-1)?.atDetailLimit).toBe(true);
    const html = buildAeronauticalMapHtml('2609', false);
    expect(html).not.toContain('enroute-data.akaflieg-freiburg.de');
    expect(html).not.toContain('openAIP');
  });

  it('shows every waypoint number when a route returns to its start', () => {
    const h = harness();
    h.api.setAeroBriefRoute([{ latitude: 52.58, longitude: 13.92 }, { latitude: 52.62, longitude: 13.88 }, { latitude: 52.58, longitude: 13.92 }]);
    expect(h.markerLabels).toHaveLength(2);
    expect(h.markerLabels[0]).toContain('1/3');
    expect(h.markerLabels[1]).toContain('2');
  });

  it('reloads the selected OFM tiles after a visual tile failure without switching layers', () => {
    const h = harness();
    h.api.refreshAeroBriefTiles();
    expect(h.tiles[0]!.layer.setUrl).toHaveBeenCalledWith(expect.stringContaining('base/latest&refresh='));
    expect(h.tiles[2]!.layer.setUrl).toHaveBeenCalledWith(expect.stringContaining('aero/latest&refresh='));
    expect(h.layers.has(h.tiles[2]!.layer)).toBe(true);
  });
});
