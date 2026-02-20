function trimSemicolons(value) {
    return value.replace(/^[\s;]+|[\s;]+$/g, '').trim();
}

function stripTextShadow(decoration) {
    if (!decoration || typeof decoration !== 'string') {
        return decoration;
    }

    var stripped = decoration.replace(/text-shadow\s*:[^;]+;?/gi, '');
    return trimSemicolons(stripped);
}

function composeTextDecoration(fontDecoration, glowShadow) {
    var parts = [];

    var fontPart = fontDecoration || '';
    if (glowShadow) {
        if (!fontPart) fontPart = 'none';
        fontPart = stripTextShadow(fontPart);
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

    return parts.map(function (part) {
        part = trimSemicolons(part);
        return part ? part + ';' : undefined;
    }).filter(Boolean).join(' ');
}

function composeThemeStyle(colorStyle, fontStyle, glowStyle) {
    var result = {};

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

    var glowShadow = glowStyle && glowStyle.textShadow;
    var decoration = composeTextDecoration(fontStyle ? fontStyle.textDecoration : undefined, glowShadow);
    if (decoration !== undefined) {
        result.textDecoration = decoration;
    }

    return result;
}

function composeTextStyle(channelStyles) {
    channelStyles = channelStyles || {};

    var light = composeThemeStyle(
        channelStyles.color ? channelStyles.color.light : undefined,
        channelStyles.font ? channelStyles.font.light : undefined,
        channelStyles.glow ? channelStyles.glow.light : undefined
    );

    var dark = composeThemeStyle(
        channelStyles.color ? channelStyles.color.dark : undefined,
        channelStyles.font ? channelStyles.font.dark : undefined,
        channelStyles.glow ? channelStyles.glow.dark : undefined
    );

    return {
        light: light,
        dark: dark
    };
}

function stableStyleHash(style) {
    function normalizeTheme(theme) {
        return {
            color: theme.color || '',
            fontWeight: theme.fontWeight || '',
            fontStyle: theme.fontStyle || '',
            textDecoration: theme.textDecoration || ''
        };
    }

    return JSON.stringify({
        light: normalizeTheme(style.light || {}),
        dark: normalizeTheme(style.dark || {})
    });
}

module.exports.composeTextDecoration = composeTextDecoration;
module.exports.composeTextStyle = composeTextStyle;
module.exports.stableStyleHash = stableStyleHash;
module.exports._stripTextShadow = stripTextShadow;
