/**
 * The DXF writer is exercised on tiny hand-built grids where the correct geometry
 * can be stated exactly. The QR-scale behaviour (does a real code decode?) lives in
 * qr-dxf-roundtrip.test.mjs; this file pins the pieces it is built from.
 */
import { describe, expect, it } from 'vitest';
import { DXF_LAYER, parseDxf, qrToDxf, signedArea, traceModuleLoops } from './dxf.mjs';

/** Rows top-to-bottom like a QR matrix: '#' dark, '.' light. */
const grid = (rows) => ({ size: rows.length, isDark: (r, c) => rows[r][c] === '#' });

const bbox = (pts) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

/** Rotate a loop so its lexicographically smallest point is first (start vertex is arbitrary). */
function normalise(pts) {
  let start = 0;
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i].x < pts[start].x || (pts[i].x === pts[start].x && pts[i].y < pts[start].y)) start = i;
  }
  return [...pts.slice(start), ...pts.slice(0, start)];
}

describe('traceModuleLoops', () => {
  it('a single dark module is one counter-clockwise square', () => {
    const loops = traceModuleLoops(grid(['#']));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(signedArea(loops[0])).toBeGreaterThan(0);
    expect(normalise(loops[0])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it('merges collinear edges: two adjacent modules are one 4-point rectangle', () => {
    const loops = traceModuleLoops(grid(['##', '..']));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    expect(bbox(loops[0])).toEqual({ minX: 0, minY: 1, maxX: 2, maxY: 2 });
  });

  it('an L shape is a single 6-point loop', () => {
    const loops = traceModuleLoops(grid(['#.', '##']));
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
    expect(signedArea(loops[0])).toBe(3);
  });

  /**
   * Finder patterns are rings. A hole must come out as its own loop wound the
   * opposite way, so that BOTH fill rules a CAD/laser tool might apply (even-odd
   * and non-zero winding) leave the centre empty.
   */
  it('a ring yields an outer CCW loop and an inner CW hole', () => {
    const loops = traceModuleLoops(grid(['###', '#.#', '###']));
    expect(loops).toHaveLength(2);
    const [outer, inner] = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    expect(signedArea(outer)).toBe(9);
    expect(signedArea(inner)).toBe(-1);
    expect(bbox(outer)).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 3 });
    expect(bbox(inner)).toEqual({ minX: 1, minY: 1, maxX: 2, maxY: 2 });
  });

  /**
   * Modules touching only at a corner must stay two loops. Merging them into one
   * self-touching polyline is flagged as self-intersecting by some importers and
   * is exactly the kind of geometry a raster trace produces.
   */
  it('keeps diagonally touching modules as separate loops', () => {
    const loops = traceModuleLoops(grid(['#.', '.#']));
    expect(loops).toHaveLength(2);
    for (const loop of loops) {
      expect(loop).toHaveLength(4);
      expect(signedArea(loop)).toBe(1);
    }
  });

  it('maps matrix rows to a y-up frame: row 0 is at the top', () => {
    const loops = traceModuleLoops(grid(['#.', '..']));
    expect(bbox(loops[0])).toEqual({ minX: 0, minY: 1, maxX: 1, maxY: 2 });
  });
});

describe('qrToDxf', () => {
  const one = grid(['#']);

  it('scales module units to the drawing extents and offsets by the quiet zone', () => {
    // 1 module + 1 margin each side = 3 units across 30 -> 10 per module.
    const { loops, extents } = parseDxf(qrToDxf(one, { size: 30, margin: 1 }));
    expect(extents).toEqual({ x: 30, y: 30 });
    expect(loops).toHaveLength(1);
    expect(normalise(loops[0].points)).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it('writes an R12 file with the sections and header the shop sample uses', () => {
    const dxf = qrToDxf(one, { size: 30, margin: 1 });
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER\n')).toBe(true);
    expect(dxf).toContain('9\n$ACADVER\n1\nAC1009\n');
    expect(dxf).toContain('9\n$EXTMIN\n10\n0.000000\n20\n0.000000\n');
    expect(dxf).toContain('9\n$EXTMAX\n10\n30.000000\n20\n30.000000\n');
    expect(dxf).toContain('0\nSECTION\n2\nTABLES\n');
    expect(dxf).toContain('0\nSECTION\n2\nENTITIES\n');
    expect(dxf.endsWith('0\nENDSEC\n0\nEOF\n')).toBe(true);
    expect(dxf).not.toContain('\r');
  });

  it('declares the QR layer in the layer table and puts every entity on it', () => {
    const dxf = qrToDxf(grid(['#.', '.#']), { size: 40, margin: 1 });
    expect(dxf).toContain(`0\nLAYER\n2\n${DXF_LAYER}\n`);
    const { loops } = parseDxf(dxf);
    expect(loops).toHaveLength(2);
    for (const loop of loops) expect(loop.layer).toBe(DXF_LAYER);
  });

  it('flags every polyline closed rather than repeating the first vertex', () => {
    const { loops } = parseDxf(qrToDxf(grid(['###', '#.#', '###']), { size: 50, margin: 1 }));
    expect(loops).toHaveLength(2);
    for (const { closed, points } of loops) {
      expect(closed).toBe(true);
      expect(points[0]).not.toEqual(points[points.length - 1]);
    }
  });

  /**
   * The failure mode found in the shop's converted sample: a polyline around the
   * whole drawing. Filled with even-odd, it turns every module inside out.
   */
  it('never emits a frame around the drawing', () => {
    const { loops, extents } = parseDxf(qrToDxf(grid(['###', '#.#', '###']), { size: 50, margin: 1 }));
    for (const { points } of loops) {
      const b = bbox(points);
      expect(b.minX).toBeGreaterThan(0);
      expect(b.minY).toBeGreaterThan(0);
      expect(b.maxX).toBeLessThan(extents.x);
      expect(b.maxY).toBeLessThan(extents.y);
    }
  });

  it('formats coordinates with six decimals like the sample', () => {
    const dxf = qrToDxf(grid(['#']), { size: 512, margin: 2 });
    // 512 / 5 modules = 102.4 per module; quiet zone edge at 2 * 102.4.
    expect(dxf).toContain('10\n204.800000\n');
  });
});

describe('parseDxf', () => {
  it('tolerates leading whitespace on group codes and CRLF endings', () => {
    const dxf = qrToDxf(grid(['#']), { size: 30, margin: 1 })
      .replace(/^(\d+)$/gm, (m) => m.padStart(3, ' '))
      .replace(/\n/g, '\r\n');
    const { version, extents, loops } = parseDxf(dxf);
    expect(version).toBe('AC1009');
    expect(extents).toEqual({ x: 30, y: 30 });
    expect(loops).toHaveLength(1);
    expect(loops[0].points).toHaveLength(4);
  });
});
