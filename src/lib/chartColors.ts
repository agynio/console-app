export const BASE_CHART_PALETTE = ['#7BA7E8', '#F58CA5', '#A8D89A', '#C9A0DC', '#F5A572'];

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

function parseHexColor(hex: string): Rgb {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: Rgb): string {
  const toHex = (value: number) => {
    const rounded = Math.round(Math.min(255, Math.max(0, value)));
    return rounded.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function darkenRgb(rgb: Rgb, amount: number): Rgb {
  const factor = 1 - amount;
  return {
    r: rgb.r * factor,
    g: rgb.g * factor,
    b: rgb.b * factor,
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

export function getSeriesColor(seriesKey: string, theme: 'light' | 'dark'): string {
  const hash = fnv1aHash(seriesKey);
  const variantCount = BASE_CHART_PALETTE.length * DARKEN_STEPS.length;
  const variantIndex = hash % variantCount;
  const baseIndex = variantIndex % BASE_CHART_PALETTE.length;
  const darkenIndex = Math.floor(variantIndex / BASE_CHART_PALETTE.length);
  const baseColor = BASE_CHART_PALETTE[baseIndex];
  const baseRgb = parseHexColor(baseColor);

  if (theme === 'light') {
    for (let index = darkenIndex; index < DARKEN_STEPS.length; index += 1) {
      const candidate = darkenRgb(baseRgb, DARKEN_STEPS[index]);
      if (contrastRatio(candidate, WHITE_RGB) >= MIN_LIGHT_CONTRAST) {
        return rgbToHex(candidate);
      }
    }
  }

  return rgbToHex(darkenRgb(baseRgb, DARKEN_STEPS[darkenIndex]));
}
