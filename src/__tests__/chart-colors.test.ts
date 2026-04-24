import { describe, expect, it } from 'vitest';
import { BASE_CHART_PALETTE, getSeriesColor } from '@/lib/chartColors';

const DARKEN_STEPS = [0, 0.12, 0.24, 0.36];
const MIN_LIGHT_CONTRAST = 2.2;
const WHITE_RGB = { r: 255, g: 255, b: 255 };

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function fnv1aHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function variantIndex(value: string): number {
  const variantCount = BASE_CHART_PALETTE.length * DARKEN_STEPS.length;
  return fnv1aHash(value) % variantCount;
}

function findKeysForVariants(): string[] {
  const variantCount = BASE_CHART_PALETTE.length * DARKEN_STEPS.length;
  const keys: Array<string | undefined> = Array.from({ length: variantCount });

  for (let index = 0; index < 20000; index += 1) {
    const key = `series-${index}`;
    const bucket = variantIndex(key);
    if (!keys[bucket]) {
      keys[bucket] = key;
    }
    if (keys.every((value) => value !== undefined)) {
      break;
    }
  }

  if (keys.some((value) => value === undefined)) {
    throw new Error('Unable to find enough distinct variant keys for chart colors.');
  }

  return keys as string[];
}

function parseHexColor(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function relativeLuminance(rgb: Rgb): number {
  const toLinear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const leftLum = relativeLuminance(left);
  const rightLum = relativeLuminance(right);
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('getSeriesColor', () => {
  it('returns deterministic colors per key and theme', () => {
    const lightFirst = getSeriesColor('alpha-series', 'light');
    const lightSecond = getSeriesColor('alpha-series', 'light');
    const darkFirst = getSeriesColor('alpha-series', 'dark');
    const darkSecond = getSeriesColor('alpha-series', 'dark');

    expect(lightSecond).toBe(lightFirst);
    expect(darkSecond).toBe(darkFirst);
  });

  it('supports at least 20 distinct variants', () => {
    const keys = findKeysForVariants();
    const colors = keys.map((key) => getSeriesColor(key, 'dark'));
    expect(new Set(colors).size).toBe(BASE_CHART_PALETTE.length * DARKEN_STEPS.length);
  });

  it('enforces minimum contrast in light theme', () => {
    const keys = findKeysForVariants();
    const contrastKey = keys[2];
    const color = getSeriesColor(contrastKey, 'light');

    expect(color).not.toBe(BASE_CHART_PALETTE[2]);
    expect(contrastRatio(parseHexColor(color), WHITE_RGB)).toBeGreaterThanOrEqual(MIN_LIGHT_CONTRAST);
  });
});
