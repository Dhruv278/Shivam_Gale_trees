/**
 * QR code -> DXF (AutoCAD R12) for the laser / CNC shop.
 *
 * WHY THIS EXISTS
 * The shop converted our 512 px QR PNGs to DXF with an online raster tracer, and
 * their software accepted the result. This module reproduces that file's shape -
 * R12 (AC1009), HEADER / TABLES / ENTITIES, closed POLYLINE contours, a 512-unit
 * square with one unit per PNG pixel, six-decimal coordinates, LF endings - but
 * from the module matrix itself, which fixes what the trace got wrong:
 *
 *   - the trace included a polyline around the whole image. Filled even-odd, the
 *     way hatch tools fill nested closed shapes, that frame inverts every module
 *     and the code only scans as a negative. Nothing here draws a frame; the
 *     drawing extents in the header carry the quiet zone instead;
 *   - traced edges landed 2-3 units off the module grid. Ours are exact;
 *   - it emitted a one-vertex polyline and a Corel colour layer. Ours emits
 *     closed loops only, on a layer called QR.
 *
 * GEOMETRY
 * Dark modules are merged into region outlines rather than one square per
 * module: fewer entities, no seam cuts, and it is what the accepted sample did.
 * Outer loops run counter-clockwise and holes clockwise, so both fill rules a
 * tool may apply - even-odd and non-zero winding - leave the holes empty.
 * Modules touching only at a corner stay separate loops; a merged self-touching
 * loop is flagged as self-intersecting by some importers.
 *
 * Pure functions throughout: a grid in, a string out; a string in, loops out.
 * Rasterising takes an injected 2D context, like drawPlate, so the print audit
 * and the tests share one renderer.
 */

export const DXF_LAYER = 'QR';
export const DXF_VERSION = 'AC1009';

/** Shoelace formula; > 0 is counter-clockwise in a y-up frame. */
export function signedArea(points) {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

/** Remove vertices that sit on a straight run, so a 2x1 block is 4 points, not 6. */
function dropCollinear(points) {
  const n = points.length;
  return points.filter((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    return (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x) !== 0;
  });
}

/**
 * Trace the boundaries of the dark modules into closed loops.
 *
 * @param {{size: number, isDark: (row: number, col: number) => boolean}} grid
 *   QR matrix, row 0 at the top (the qrcode library's convention).
 * @returns {Array<Array<{x: number, y: number}>>} loops in module units, y-up,
 *   origin at the bottom-left of the module grid. Outer loops CCW, holes CW.
 */
export function traceModuleLoops({ size, isDark }) {
  // y-up: matrix row r lives at y = size - 1 - r.
  const dark = (x, y) =>
    x >= 0 && y >= 0 && x < size && y < size && Boolean(isDark(size - 1 - y, x));

  // Every boundary edge is directed with the dark module on its LEFT. That single
  // rule makes outer loops CCW and holes CW with no post-processing.
  const edges = [];
  const outgoing = new Map();
  const key = (x, y) => `${x},${y}`;
  const add = (x0, y0, x1, y1) => {
    const edge = { x0, y0, x1, y1, dx: x1 - x0, dy: y1 - y0, used: false };
    edges.push(edge);
    const k = key(x0, y0);
    if (!outgoing.has(k)) outgoing.set(k, []);
    outgoing.get(k).push(edge);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!dark(x, y)) continue;
      if (!dark(x, y - 1)) add(x, y, x + 1, y); // bottom edge, heading +x
      if (!dark(x + 1, y)) add(x + 1, y, x + 1, y + 1); // right edge, heading +y
      if (!dark(x, y + 1)) add(x + 1, y + 1, x, y + 1); // top edge, heading -x
      if (!dark(x - 1, y)) add(x, y + 1, x, y); // left edge, heading -y
    }
  }

  const cross = (a, b) => a.dx * b.dy - a.dy * b.dx;
  const loops = [];
  for (const start of edges) {
    if (start.used) continue;
    const points = [];
    let edge = start;
    for (;;) {
      edge.used = true;
      points.push({ x: edge.x0, y: edge.y0 });
      // Where two dark regions meet at a corner there are two ways on. Turning LEFT
      // keeps hugging the region on our left, so the loops stay separate. The start
      // edge stays a candidate so that closing the loop follows the same rule.
      const options = outgoing
        .get(key(edge.x1, edge.y1))
        .filter((c) => !c.used || c === start);
      if (options.length === 0) throw new Error('DXF trace: boundary did not close');
      const next = options.reduce((best, c) => (cross(edge, c) > cross(edge, best) ? c : best));
      if (next === start) break;
      edge = next;
    }
    loops.push(dropCollinear(points));
  }
  return loops;
}

const fmt = (n) => n.toFixed(6);

function serialiseDxf(loops, extent) {
  const out = [];
  const tag = (code, value) => out.push(String(code), String(value));
  const point = (x, y) => {
    tag(10, fmt(x));
    tag(20, fmt(y));
    tag(30, fmt(0));
  };

  tag(0, 'SECTION');
  tag(2, 'HEADER');
  tag(9, '$ACADVER');
  tag(1, DXF_VERSION);
  tag(9, '$EXTMIN');
  point(0, 0);
  tag(9, '$EXTMAX');
  point(extent, extent);
  tag(0, 'ENDSEC');

  tag(0, 'SECTION');
  tag(2, 'TABLES');
  tag(0, 'TABLE');
  tag(2, 'LTYPE');
  tag(70, 1);
  tag(0, 'LTYPE');
  tag(2, 'CONTINUOUS');
  tag(70, 0);
  tag(3, 'Solid line');
  tag(72, 65);
  tag(73, 0);
  tag(40, fmt(0));
  tag(0, 'ENDTAB');
  tag(0, 'TABLE');
  tag(2, 'LAYER');
  tag(70, 2);
  for (const name of ['0', DXF_LAYER]) {
    tag(0, 'LAYER');
    tag(2, name);
    tag(70, 0);
    tag(62, 7);
    tag(6, 'CONTINUOUS');
  }
  tag(0, 'ENDTAB');
  tag(0, 'ENDSEC');

  tag(0, 'SECTION');
  tag(2, 'ENTITIES');
  for (const points of loops) {
    tag(0, 'POLYLINE');
    tag(8, DXF_LAYER);
    tag(66, 1); // vertices follow
    tag(70, 1); // closed
    point(0, 0); // R12 requires a (ignored) location on the POLYLINE itself
    for (const { x, y } of points) {
      tag(0, 'VERTEX');
      tag(8, DXF_LAYER);
      point(x, y);
    }
    tag(0, 'SEQEND');
    tag(8, DXF_LAYER);
  }
  tag(0, 'ENDSEC');
  tag(0, 'EOF');
  return `${out.join('\n')}\n`;
}

/**
 * Render a QR module grid as DXF text.
 *
 * `size` is the drawing extent in drawing units and `margin` the quiet zone in
 * modules - the same two numbers the PNG and SVG renderers take, so all three
 * files are the same drawing at the same scale.
 */
export function qrToDxf(grid, { size = 512, margin = 2 } = {}) {
  const unit = size / (grid.size + 2 * margin);
  const loops = traceModuleLoops(grid).map((points) =>
    points.map(({ x, y }) => ({ x: (x + margin) * unit, y: (y + margin) * unit })),
  );
  return serialiseDxf(loops, size);
}

/**
 * Read back the subset of DXF this module writes: header extents/version and
 * POLYLINE / VERTEX / SEQEND loops. Tolerant of padded group codes and CRLF.
 *
 * @returns {{version: string|null, extents: {x: number, y: number}|null,
 *   loops: Array<{layer: string|null, closed: boolean, points: Array<{x: number, y: number}>}>}}
 */
export function parseDxf(text) {
  const lines = text.split(/\r?\n/);
  const header = {};
  const loops = [];
  let section = null;
  let variable = null;
  let loop = null;

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();

    if (code === '0' && value === 'SECTION') {
      section = 'SECTION';
      continue;
    }
    if (code === '2' && section === 'SECTION') {
      section = value;
      continue;
    }
    if (code === '0' && value === 'ENDSEC') {
      section = null;
      continue;
    }

    if (section === 'HEADER') {
      if (code === '9') {
        variable = value;
        header[variable] = {};
      } else if (variable) {
        header[variable][code] = value;
      }
    } else if (section === 'ENTITIES') {
      if (code === '0') {
        if (value === 'POLYLINE') loop = { layer: null, closed: false, points: [] };
        else if (value === 'VERTEX' && loop) loop.points.push({ x: 0, y: 0 });
        else if (value === 'SEQEND' && loop) {
          loops.push(loop);
          loop = null;
        }
      } else if (loop) {
        if (loop.points.length === 0) {
          // Still on the POLYLINE header; its own 10/20/30 location is ignored.
          if (code === '8') loop.layer = value;
          else if (code === '70') loop.closed = (Number(value) & 1) === 1;
        } else {
          const vertex = loop.points[loop.points.length - 1];
          if (code === '10') vertex.x = Number(value);
          else if (code === '20') vertex.y = Number(value);
        }
      }
    }
  }

  const extMax = header.$EXTMAX;
  return {
    version: header.$ACADVER?.['1'] ?? null,
    extents: extMax ? { x: Number(extMax['10']), y: Number(extMax['20']) } : null,
    loops,
  };
}

/**
 * Fill parsed DXF loops onto a 2D context `px` pixels square, the way a hatch
 * tool would: white ground, black closed shapes, one compound path so nested
 * loops become holes. DXF is y-up; canvas is y-down.
 */
export function drawDxf(ctx, { loops, extents }, px, fillRule = 'evenodd') {
  const scale = px / extents.x;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  for (const { points } of loops) {
    points.forEach(({ x, y }, i) => {
      const cx = x * scale;
      const cy = (extents.y - y) * scale;
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
  }
  ctx.fill(fillRule);
}
