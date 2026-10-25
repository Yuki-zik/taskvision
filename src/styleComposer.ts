import type { ThemeStyle, ThemedStyle, TextChannels } from './model';
function trimSemicolons(value: string) {
  return value.replace(/^[\s;]+|[\s;]+$/g, '').trim();
}

function stripTextShadow(decoration?: string) {
  if (!decoration || typeof decoration !== 'string') {
    return decoration;
  }

  const stripped = decoration.replace(/text-shadow\s*:[^;]+;?/gi, '');
  return trimSemicolons(stripped);
}

function composeTextDecoration(fontDecoration?: string, glowShadow?: string) {
  const parts = [];

  let fontPart = fontDecoration || '';
  if (glowShadow) {
    if (!fontPart) fontPart = 'none';
    fontPart = stripTextShadow(fontPart) || '';
  }

  if (fontPart) {
    parts.push(fontPart);
  }

  if (glowShadow) {
    parts.push('text-shadow: ' + glowShadow);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts
    .map(function (part) {
      part = trimSemicolons(part);
      return part ? part + ';' : undefined;
    })
    .filter(Boolean)
    .join(' ');
}

function composeThemeStyle(
  colorStyle?: ThemeStyle,
  fontStyle?: ThemeStyle,
  glowStyle?: ThemeStyle,
) {
  const result: ThemeStyle = {};

  if (colorStyle && colorStyle.color !== undefined) {
    result.color = colorStyle.color;
  }

  if (fontStyle) {
    if (fontStyle.fontWeight !== undefined) {
      result.fontWeight = fontStyle.fontWeight;
    }
    if (fontStyle.fontStyle !== undefined) {
      result.fontStyle = fontStyle.fontStyle;
    }
  }

  const glowShadow = glowStyle && glowStyle.textShadow;
  const decoration = composeTextDecoration(
    fontStyle ? fontStyle.textDecoration : undefined,
    glowShadow,
  );
  if (decoration !== undefined) {
    result.textDecoration = decoration;
  }

  return result;
}

function composeTextStyle(channelStyles: TextChannels = {}) {
  channelStyles = channelStyles || {};

  const light = composeThemeStyle(
    channelStyles.color ? channelStyles.color.light : undefined,
    channelStyles.font ? channelStyles.font.light : undefined,
    channelStyles.glow ? channelStyles.glow.light : undefined,
  );

  const dark = composeThemeStyle(
    channelStyles.color ? channelStyles.color.dark : undefined,
    channelStyles.font ? channelStyles.font.dark : undefined,
    channelStyles.glow ? channelStyles.glow.dark : undefined,
  );

  return {
    light: light,
    dark: dark,
  };
}

function stableStyleHash(style: Partial<ThemedStyle>) {
  function normalizeTheme(theme: ThemeStyle) {
    return {
      color: theme.color || '',
      fontWeight: theme.fontWeight || '',
      fontStyle: theme.fontStyle || '',
      textDecoration: theme.textDecoration || '',
    };
  }

  return JSON.stringify({
    light: normalizeTheme(style.light || {}),
    dark: normalizeTheme(style.dark || {}),
  });
}

export {
  composeTextDecoration,
  composeTextStyle,
  stableStyleHash,
  stripTextShadow as _stripTextShadow,
};
