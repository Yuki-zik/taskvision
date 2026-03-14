var utils = require('./utils.js');

function resolveColor(color, fallback) {
    if (!color || typeof color !== 'string') {
        return fallback;
    }

    if (color.startsWith('#') || color.startsWith('rgb(') || color.startsWith('rgba(') || color.startsWith('var(')) {
        return color;
    }

    return fallback;
}

function withAlpha(color, percentage) {
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

function normalizeOpacity(opacity, fallback) {
    if (opacity === undefined || opacity === null || opacity === '') {
        return fallback;
    }

    return opacity <= 1 ? opacity * 100 : opacity;
}

function withOptionalAlpha(color, opacity, fallback) {
    var percentage = normalizeOpacity(opacity, fallback);

    if (percentage === undefined || percentage === 100) {
        return color;
    }

    return withAlpha(color, percentage);
}

function getGlowShadow(color, opacity) {
    var shadowColor = withOptionalAlpha(color, opacity, 100);
    return '0 0 5px ' + shadowColor + ', 0 0 10px ' + shadowColor + ', 0 0 15px ' + shadowColor + ', 0 0 20px ' + shadowColor + ', 0 0 30px ' + shadowColor;
}

function getPreset(schemeName, lightBaseColor, darkBaseColor, channelOptions) {
    channelOptions = channelOptions || {};

    var defaultAccent = '#42A5F5';
    var lightColor = resolveColor(lightBaseColor, defaultAccent);
    var darkColor = resolveColor(darkBaseColor, lightColor);
    var glowOpacity = normalizeOpacity(channelOptions.glowOpacity, 100);
    var glassOpacity = normalizeOpacity(channelOptions.glassOpacity, 15);
    var glassBorderOpacity = normalizeOpacity(channelOptions.glassBorderOpacity, 60);

    var hasGlow = schemeName === 'neon' || schemeName === 'neon+glass';
    var hasGlass = schemeName === 'glass' || schemeName === 'neon+glass';

    return {
        lightColor: lightColor,
        darkColor: darkColor,
        glow: hasGlow ? {
            light: { textShadow: getGlowShadow(lightColor, glowOpacity) },
            dark: { textShadow: getGlowShadow(darkColor, glowOpacity) }
        } : undefined,
        glass: hasGlass ? {
            borderRadius: '6px',
            light: {
                backgroundColor: withAlpha(lightColor, glassOpacity),
                border: '1px solid ' + withAlpha(lightColor, glassBorderOpacity)
            },
            dark: {
                backgroundColor: withAlpha(darkColor, glassOpacity),
                border: '1px solid ' + withAlpha(darkColor, glassBorderOpacity)
            }
        } : undefined
    };
}

function applyScheme(options, schemeName, lightBaseColor, darkBaseColor) {
    options = options || {};
    options.light = options.light || {};
    options.dark = options.dark || {};

    var preset = getPreset(schemeName, lightBaseColor, darkBaseColor);
    if (preset.glass) {
        options.borderRadius = options.borderRadius || preset.glass.borderRadius;
        Object.assign(options.light, preset.glass.light);
        Object.assign(options.dark, preset.glass.dark);
    }

    if (preset.glow) {
        var lightDecoration = options.light.textDecoration;
        var darkDecoration = options.dark.textDecoration;

        options.light.textDecoration = [lightDecoration, 'text-shadow: ' + preset.glow.light.textShadow + ';']
            .filter(Boolean)
            .join(' ')
            .trim();
        options.dark.textDecoration = [darkDecoration, 'text-shadow: ' + preset.glow.dark.textShadow + ';']
            .filter(Boolean)
            .join(' ')
            .trim();
    }

    return options;
}

module.exports.getPreset = getPreset;
module.exports.applyScheme = applyScheme;
