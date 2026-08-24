import { describe, expect, test } from 'vitest';
import { PLATE_TEMPLATES, drawPlate, getPlateTemplate, plateFileName } from './plate.mjs';

const AAM_PLATE = PLATE_TEMPLATES?.Aam;

/** Records every canvas call so geometry and layer order can be asserted. */
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

describe('AAM_PLATE geometry', () => {
  test('matches the measured template: 1600x1309 with the QR box inside the plate', () => {
    expect(AAM_PLATE.width).toBe(1600);
    expect(AAM_PLATE.height).toBe(1309);
    const { qrBox } = AAM_PLATE;
    expect(qrBox.x).toBeGreaterThan(AAM_PLATE.width / 2);
    expect(qrBox.x + qrBox.size).toBeLessThan(AAM_PLATE.width);
    expect(qrBox.y + qrBox.size).toBeLessThan(AAM_PLATE.height / 2);
  });
});

describe('getPlateTemplate', () => {
  test('config for a templated species, null otherwise', () => {
    expect(getPlateTemplate('Aam')).toBe(PLATE_TEMPLATES.Aam);
    expect(getPlateTemplate('Neem')).toBeNull();
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

  test('stamps the number centered at the configured spot in the Stencil font', () => {
    const ctx = fakeCtx();
    drawPlate(ctx, { templateImage, qrImage, number: 7, plate: AAM_PLATE });

    const fills = ctx.calls.filter(([op]) => op === 'fillText');
    expect(fills).toEqual([['fillText', '7', AAM_PLATE.number.centerX, AAM_PLATE.number.centerY]]);
    expect(ctx.font).toBe(`${AAM_PLATE.number.fontSize}px Stencil, serif`);
    expect(ctx.fillStyle).toBe('#ffffff');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
  });
});
