/// <reference types="node" />
import { runInNewContext } from 'node:vm';
import { DOCUMENT_ZOOM_SCRIPT } from '@/data/documentZoomScript';

function viewer() {
  let zoom = 1;
  let pendingFrame = () => {};
  const events: Record<string, (event: { touches: { clientX: number; clientY: number }[]; preventDefault: () => void }) => void> = {};
  const viewport = { scrollLeft: 80, scrollTop: 500, clientWidth: 300, clientHeight: 400, getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: (name: string, fn: typeof events[string]) => { events[name] = fn; } };
  const records = [0, 1].map((index) => ({ shell: { getBoundingClientRect: () => ({ left: 14 - viewport.scrollLeft, top: 14 + index * (600 * zoom + 14) - viewport.scrollTop, bottom: 14 + index * (600 * zoom + 14) + 600 * zoom - viewport.scrollTop, width: 300 * zoom, height: 600 * zoom }) } }));
  const report = jest.fn(); const sharpen = jest.fn();
  const window: { setAeroBriefZoom?: (zoom: number) => void } = {};
  runInNewContext(`${DOCUMENT_ZOOM_SCRIPT}\ninstallDocumentZoom(viewport,records,getZoom,resize,report,sharpen);`, { window, viewport, records, getZoom: () => zoom, resize: (value: number) => { zoom = value; }, report, sharpen, requestAnimationFrame: (fn: () => void) => { pendingFrame = fn; return 1; }, cancelAnimationFrame: jest.fn() });
  const touch = (name: string, coords: number[][]) => events[name]!({ touches: coords.map(([clientX, clientY]) => ({ clientX: clientX!, clientY: clientY! })), preventDefault: jest.fn() });
  const point = () => { const r = records[1]!.shell.getBoundingClientRect(); return { u: (150 - r.left) / r.width, v: (220 - r.top) / r.height }; };
  return { window, viewport, touch, point, flush: () => pendingFrame(), zoom: () => zoom, report };
}

describe('shared document focal anchoring', () => {
  it('keeps the same point on the second page through pinch release', () => {
    const v = viewer(); const before = v.point();
    v.touch('touchstart', [[100, 220], [200, 220]]);
    v.touch('touchmove', [[50, 220], [250, 220]]);
    v.flush();
    expect(v.zoom()).toBe(2);
    expect(v.point().u).toBeCloseTo(before.u);
    expect(v.point().v).toBeCloseTo(before.v);
    const scroll = { x: v.viewport.scrollLeft, y: v.viewport.scrollTop };
    v.touch('touchend', []);
    expect(v.viewport.scrollLeft).toBeCloseTo(scroll.x);
    expect(v.viewport.scrollTop).toBeCloseTo(scroll.y);
  });
  it('commits the last pending frame before reporting the finished pinch', () => {
    const v = viewer(); const before = v.point();
    v.touch('touchstart', [[100, 220], [200, 220]]);
    v.touch('touchmove', [[0, 220], [300, 220]]);
    v.touch('touchend', []);
    expect(v.zoom()).toBe(3);
    expect(v.point().v).toBeCloseTo(before.v);
    expect(v.report).toHaveBeenCalledTimes(1);
  });
  it('bounds button zoom and ignores non-finite input', () => {
    const v = viewer(); v.window.setAeroBriefZoom!(8); expect(v.zoom()).toBe(4);
    v.window.setAeroBriefZoom!(NaN); expect(v.zoom()).toBe(4);
    v.window.setAeroBriefZoom!(0); expect(v.zoom()).toBe(1);
  });
});
