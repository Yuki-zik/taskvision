import type { ThemeStyle, HighlightChannelOptions, HighlightChannel } from './model';
import * as rangeResolver from './rangeResolver.js';

function resolveSchemeFlags(scheme?: string) {
  return {
    glow: scheme === 'neon' || scheme === 'neon+glass',
    glass: scheme === 'glass' || scheme === 'neon+glass',
  };
}

function hasTextColor(light?: ThemeStyle, dark?: ThemeStyle) {
  return (light && light.color !== undefined) || (dark && dark.color !== undefined);
}

function hasFontStyle(light?: ThemeStyle, dark?: ThemeStyle) {
  function hasThemeStyle(theme?: ThemeStyle) {
    return !!(
      theme &&
      (theme.fontWeight !== undefined ||
        theme.fontStyle !== undefined ||
        theme.textDecoration !== undefined)
    );
  }
  return hasThemeStyle(light) || hasThemeStyle(dark);
}

function hasGlassStyle(light?: ThemeStyle, dark?: ThemeStyle) {
  function hasThemeStyle(theme?: ThemeStyle) {
    return !!(theme && (theme.backgroundColor !== undefined || theme.border !== undefined));
  }
  return hasThemeStyle(light) || hasThemeStyle(dark);
}

function buildChannels(options: HighlightChannelOptions = {}) {
  options = options || {};

  const schemeFlags = resolveSchemeFlags(options.scheme);
  const schemePreset = options.schemePreset || {};

  const colorStyle = {
    light: { color: options.lightForegroundColour },
    dark: { color: options.darkForegroundColour },
  };

  const fontStyle = {
    light: {
      fontWeight: options.fontWeight,
      fontStyle: options.fontStyle,
      textDecoration: options.textDecoration,
    },
    dark: {
      fontWeight: options.fontWeight,
      fontStyle: options.fontStyle,
      textDecoration: options.textDecoration,
    },
  };

  const explicitGlassStyle = {
    light: {
      backgroundColor: options.lightBackgroundColour,
    },
    dark: {
      backgroundColor: options.darkBackgroundColour,
    },
    borderRadius: options.borderRadius,
  };

  const presetGlassStyle = schemeFlags.glass && schemePreset.glass ? schemePreset.glass : undefined;
  const glowStyle = schemeFlags.glow && schemePreset.glow ? schemePreset.glow : undefined;

  const cleanExplicitLight =
    explicitGlassStyle.light.backgroundColor !== undefined
      ? { backgroundColor: explicitGlassStyle.light.backgroundColor }
      : {};
  const cleanExplicitDark =
    explicitGlassStyle.dark.backgroundColor !== undefined
      ? { backgroundColor: explicitGlassStyle.dark.backgroundColor }
      : {};

  const glassLight = Object.assign(
    {},
    presetGlassStyle ? presetGlassStyle.light : {},
    cleanExplicitLight,
  );
  const glassDark = Object.assign(
    {},
    presetGlassStyle ? presetGlassStyle.dark : {},
    cleanExplicitDark,
  );

  const channels: Record<'color' | 'glow' | 'glass' | 'font', HighlightChannel> = {
    color: {
      kind: 'color',
      enabled: !!hasTextColor(colorStyle.light, colorStyle.dark),
      rangeType: rangeResolver.normaliseRangeType(options.colorType),
      style: colorStyle,
    },
    glow: {
      kind: 'glow',
      enabled: !!glowStyle,
      rangeType: rangeResolver.normaliseRangeType(options.glowType),
      style: glowStyle || { light: {}, dark: {} },
    },
    glass: {
      kind: 'glass',
      enabled: hasGlassStyle(glassLight, glassDark),
      rangeType: rangeResolver.normaliseRangeType(options.glassType),
      style: {
        light: glassLight,
        dark: glassDark,
        borderRadius:
          explicitGlassStyle.borderRadius ||
          (presetGlassStyle ? presetGlassStyle.borderRadius : undefined),
      },
    },
    font: {
      kind: 'font',
      enabled: hasFontStyle(fontStyle.light, fontStyle.dark),
      rangeType: rangeResolver.normaliseRangeType(options.fontType),
      style: fontStyle,
    },
  };

  (Object.keys(channels) as (keyof typeof channels)[]).forEach(function (key) {
    if (channels[key].rangeType === undefined) {
      channels[key].rangeType = 'none';
    }
    if (channels[key].rangeType === 'none') {
      channels[key].enabled = false;
    }
  });

  return channels;
}

export { resolveSchemeFlags, buildChannels };
