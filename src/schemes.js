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

function getGlowShadow(color) {
    return '0 0 5px ' + color + ', 0 0 10px ' + color + ', 0 0 15px ' + color + ', 0 0 20px ' + color + ', 0 0 30px ' + color;
}

function getPreset(schemeName, lightBaseColor, darkBaseColor) {
    var defaultAccent = '#42A5F5';
    var lightColor = resolveColor(lightBaseColor, defaultAccent);
    var darkColor = resolveColor(darkBaseColor, lightColor);

    var hasGlow = schemeName === 'neon' || schemeName === 'neon+glass';
    var hasGlass = schemeName === 'glass' || schemeName === 'neon+glass';

    return {
        lightColor: lightColor,
        darkColor: darkColor,
        glow: hasGlow ? {
            light: { textShadow: getGlowShadow(lightColor) },
            dark: { textShadow: getGlowShadow(darkColor) }
        } : undefined,
        glass: hasGlass ? {
            borderRadius: '6px',
            light: {
                backgroundColor: withAlpha(lightColor, 15),
                border: '1px solid ' + withAlpha(lightColor, 60)
            },
            dark: {
                backgroundColor: withAlpha(darkColor, 15),
                border: '1px solid ' + withAlpha(darkColor, 60)
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
