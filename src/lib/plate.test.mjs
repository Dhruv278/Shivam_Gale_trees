import { describe, expect, test } from 'vitest';
import { PLATE_TEMPLATES, drawPlate, getPlateTemplate, plateFileName } from './plate.mjs';

const AAM_PLATE = PLATE_TEMPLATES?.Aam;

/**
 * Records every canvas call so geometry and layer order can be asserted.
 *
 * measureText scales with the currently-set font size (parsed from ctx.font):
 * Chrome and @napi-rs/canvas report different real metrics, so drawPlate must
 * derive positions from measurements, never from engine baseline behavior.
 */
function fakeCtx() {
  const calls = [];
  return {
    calls,
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    drawImage(...args) {
      calls.push(['drawImage', ...args]);
    },
    fillText(...args) {
      calls.push(['fillText', ...args]);
    },
    measureText(text) {
      const size = Number(/^(\d+)px/.exec(this.font)?.[1] ?? 0);
      return {
        width: size * text.length * 0.6,
        actualBoundingBoxAscent: size * 0.5,
        actualBoundingBoxDescent: size * 0.1,
      };
    },
  };
}

const templateImage = { id: 'template' };
const qrImage = { id: 'qr' };

describe('plateFileName', () => {
  test('builds the download name from species and tree number', () => {
    expect(plateFileName('Aam', 1)).toBe('Aam-1-plate.jpg');
    expect(plateFileName('Royal Palm', 12)).toBe('Royal Palm-12-plate.jpg');
  });
});

describe('PLATE_TEMPLATES registry', () => {
  test('covers all 45 survey species', () => {
    expect(Object.keys(PLATE_TEMPLATES)).toHaveLength(45);
    for (const s of ['Aam', 'Ashok', 'Gulmohur', 'Khajur', 'Lasora', 'Mahogani', 'Royal Palm']) {
      expect(PLATE_TEMPLATES[s]).toBeDefined();
    }
  });

  test('every template shares the measured 1651x1351 layout with the QR box inside the plate', () => {
    for (const plate of Object.values(PLATE_TEMPLATES)) {
      expect(plate.width).toBe(1651);
      expect(plate.height).toBe(1351);
      expect(plate.qrBox).toEqual({ x: 1058, y: 314, size: 237 });
      expect(plate.number.centerX).toBe(756);
      expect(plate.number.centerY).toBe(433);
      // the number band must end before the QR box begins
      expect(plate.number.centerX + plate.number.maxWidth / 2).toBeLessThan(plate.qrBox.x);
    }
  });

  test('template paths are slugified species files', () => {
    expect(PLATE_TEMPLATES.Aam.template).toBe('/plates/aam.jpg');
    expect(PLATE_TEMPLATES['Royal Palm'].template).toBe('/plates/royal-palm.jpg');
    expect(PLATE_TEMPLATES['Ponytail palm'].template).toBe('/plates/ponytail-palm.jpg');
  });
});

describe('getPlateTemplate', () => {
  test('config for every survey species, null for unknown names', () => {
    expect(getPlateTemplate('Aam')).toBe(PLATE_TEMPLATES.Aam);
    expect(getPlateTemplate('Neem')).toBe(PLATE_TEMPLATES.Neem);
    expect(getPlateTemplate('Ghost')).toBeNull();
  });
});

describe('drawPlate', () => {
  test('draws the template first, covering the whole plate', () => {
    const ctx = fakeCtx();
    drawPlate(ctx, { templateImage, qrImage, number: 1, plate: AAM_PLATE });

    const [first] = ctx.calls;
    expect(first).toEqual(['drawImage', templateImage, 0, 0, AAM_PLATE.width, AAM_PLATE.height]);
  });

  test('draws the QR exactly inside the measured box, on top of the template', () => {
    const ctx = fakeCtx();
    drawPlate(ctx, { templateImage, qrImage, number: 1, plate: AAM_PLATE });

    const draws = ctx.calls.filter(([op]) => op === 'drawImage');
    const { qrBox } = AAM_PLATE;
    expect(draws[1]).toEqual(['drawImage', qrImage, qrBox.x, qrBox.y, qrBox.size, qrBox.size]);
  });

  test('centers the measured glyph box on the configured spot, engine-independently', () => {
    const ctx = fakeCtx();
    drawPlate(ctx, { templateImage, qrImage, number: 7, plate: AAM_PLATE });

    // fake metrics at 361px: ascent 180.5, descent 36.1 ->
    // baseline = 433 + (180.5 - 36.1) / 2 = 505.2
    const fills = ctx.calls.filter(([op]) => op === 'fillText');
    expect(fills).toHaveLength(1);
    expect(fills[0][1]).toBe('7');
    expect(fills[0][2]).toBe(AAM_PLATE.number.centerX);
    expect(fills[0][3]).toBeCloseTo(505.2, 5);
    expect(ctx.font).toBe(`${AAM_PLATE.number.fontSize}px Stencil, serif`);
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('alphabetic');
  });

  test('a 3-digit number shrinks to fit the band and stays centered', () => {
    const ctx = fakeCtx();
    drawPlate(ctx, { templateImage, qrImage, number: 323, plate: AAM_PLATE });

    // fake width at 361px = 361 * 3 * 0.6 = 649.8 > maxWidth 560 ->
    // fontSize floor(361 * 560 / 649.8) = 311; then ascent 155.5, descent 31.1
    // -> baseline = 433 + (155.5 - 31.1) / 2 = 495.2
    const fills = ctx.calls.filter(([op]) => op === 'fillText');
    expect(ctx.font).toBe('311px Stencil, serif');
    expect(fills[0][1]).toBe('323');
    expect(fills[0][2]).toBe(AAM_PLATE.number.centerX);
    expect(fills[0][3]).toBeCloseTo(495.2, 5);
  });
});
