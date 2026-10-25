import type { ThemedStyle } from './model';
import * as utils from './utils.js';

function resolveColor(color: unknown, fallback: string) {
  if (!color || typeof color !== 'string') {
    return fallback;
  }

  if (
    color.startsWith('#') ||
    color.startsWith('rgb(') ||
    color.startsWith('rgba(') ||
    color.startsWith('var(')
  ) {
    return color;
  }

  return fallback;
}

function withAlpha(color: string, percentage: number) {
  if (!color) {
    return color;
  }

  if (utils.isHexColour(color)) {
    return utils.hexToRgba(color, percentage);
  }

  if (utils.isRgbColour(color)) {
    return utils.setRgbAlpha(color, percentage / 100);
  }

  return color;
}

function normalizeOpacity(opacity: number | string | null | undefined, fallback?: number) {
  if (opacity === undefined || opacity === null || opacity === '') {
    return fallback;
  }

  const number = Number(opacity);
  return number <= 1 ? number * 100 : number;
}

function withOptionalAlpha(color: string, opacity: number | undefined, fallback?: number) {
  const percentage = normalizeOpacity(opacity, fallback);

  if (percentage === undefined || percentage === 100) {
    return color;
  }

  return withAlpha(color, percentage);
}

function getGlowShadow(color: string, opacity: number) {
  const shadowColor = withOptionalAlpha(color, opacity, 100);
  return (
    '0 0 5px ' +
    shadowColor +
    ', 0 0 10px ' +
    shadowColor +
    ', 0 0 15px ' +
    shadowColor +
    ', 0 0 20px ' +
    shadowColor +
    ', 0 0 30px ' +
    shadowColor
  );
}

function getPreset(
  schemeName?: string,
  lightBaseColor?: string | import('vscode').ThemeColor,
  darkBaseColor?: string | import('vscode').ThemeColor,
  channelOptions: { glowOpacity?: number; glassOpacity?: number; glassBorderOpacity?: number } = {},
) {
  channelOptions = channelOptions || {};

  const defaultAccent = '#42A5F5';
  const lightColor = resolveColor(lightBaseColor, defaultAccent);
  const darkColor = resolveColor(darkBaseColor, lightColor);
  const glowOpacity = normalizeOpacity(channelOptions.glowOpacity, 45);
  const glassOpacity = normalizeOpacity(channelOptions.glassOpacity, undefined);
  const glassBorderOpacity = normalizeOpacity(channelOptions.glassBorderOpacity, undefined);

  const hasGlow = schemeName === 'neon' || schemeName === 'neon+glass';
  const hasGlass = schemeName === 'glass' || schemeName === 'neon+glass';

  return {
    lightColor: lightColor,
    darkColor: darkColor,
    glow:
      hasGlow && glowOpacity !== undefined
        ? {
            light: { textShadow: getGlowShadow(lightColor, glowOpacity) },
            dark: { textShadow: getGlowShadow(darkColor, glowOpacity) },
          }
        : undefined,
    glass: hasGlass
      ? {
          borderRadius: '6px',
          light: {
            backgroundColor:
              glassOpacity !== undefined ? withAlpha(lightColor, glassOpacity) : undefined,
            border:
              glassBorderOpacity !== undefined
                ? '1px solid ' + withAlpha(lightColor, glassBorderOpacity)
                : undefined,
          },
          dark: {
            backgroundColor:
              glassOpacity !== undefined ? withAlpha(darkColor, glassOpacity) : undefined,
            border:
              glassBorderOpacity !== undefined
                ? '1px solid ' + withAlpha(darkColor, glassBorderOpacity)
                : undefined,
          },
        }
      : undefined,
  };
}

function applyScheme(
  options: Partial<ThemedStyle> = {},
  schemeName?: string,
  lightBaseColor?: string,
  darkBaseColor?: string,
) {
  options = options || {};
  options.light = options.light || {};
  options.dark = options.dark || {};

  const preset = getPreset(schemeName, lightBaseColor, darkBaseColor);
  if (preset.glass) {
    options.borderRadius = options.borderRadius || preset.glass.borderRadius;
    Object.assign(options.light, preset.glass.light);
    Object.assign(options.dark, preset.glass.dark);
  }

  if (preset.glow) {
    const lightDecoration = options.light.textDecoration;
    const darkDecoration = options.dark.textDecoration;

    options.light.textDecoration = [
      lightDecoration,
      'text-shadow: ' + preset.glow.light.textShadow + ';',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    options.dark.textDecoration = [
      darkDecoration,
      'text-shadow: ' + preset.glow.dark.textShadow + ';',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  return options;
}

export { getPreset, applyScheme };
