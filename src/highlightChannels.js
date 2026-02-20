var rangeResolver = require('./rangeResolver.js');

function resolveSchemeFlags(scheme) {
    return {
        glow: scheme === 'neon' || scheme === 'neon+glass',
        glass: scheme === 'glass' || scheme === 'neon+glass'
    };
}

function hasTextColor(light, dark) {
    return (light && light.color !== undefined) || (dark && dark.color !== undefined);
}

function hasFontStyle(light, dark) {
    function hasThemeStyle(theme) {
        return !!(theme && (
            theme.fontWeight !== undefined ||
            theme.fontStyle !== undefined ||
            theme.textDecoration !== undefined
        ));
    }
    return hasThemeStyle(light) || hasThemeStyle(dark);
}

function hasGlassStyle(light, dark) {
    function hasThemeStyle(theme) {
        return !!(theme && (
            theme.backgroundColor !== undefined ||
            theme.border !== undefined
        ));
    }
    return hasThemeStyle(light) || hasThemeStyle(dark);
}

function buildChannels(options) {
    options = options || {};

    var schemeFlags = resolveSchemeFlags(options.scheme);
    var schemePreset = options.schemePreset || {};

    var colorStyle = {
        light: { color: options.lightForegroundColour },
        dark: { color: options.darkForegroundColour }
    };

    var fontStyle = {
        light: {
            fontWeight: options.fontWeight,
            fontStyle: options.fontStyle,
            textDecoration: options.textDecoration
        },
        dark: {
            fontWeight: options.fontWeight,
            fontStyle: options.fontStyle,
            textDecoration: options.textDecoration
        }
    };

    var explicitGlassStyle = {
        light: {
            backgroundColor: options.lightBackgroundColour
        },
        dark: {
            backgroundColor: options.darkBackgroundColour
        },
        borderRadius: options.borderRadius
    };

    var presetGlassStyle = schemeFlags.glass && schemePreset.glass ? schemePreset.glass : undefined;
    var glowStyle = schemeFlags.glow && schemePreset.glow ? schemePreset.glow : undefined;

    var cleanExplicitLight = explicitGlassStyle.light.backgroundColor !== undefined ? { backgroundColor: explicitGlassStyle.light.backgroundColor } : {};
    var cleanExplicitDark = explicitGlassStyle.dark.backgroundColor !== undefined ? { backgroundColor: explicitGlassStyle.dark.backgroundColor } : {};

    var glassLight = Object.assign({}, presetGlassStyle ? presetGlassStyle.light : {}, cleanExplicitLight);
    var glassDark = Object.assign({}, presetGlassStyle ? presetGlassStyle.dark : {}, cleanExplicitDark);

    var channels = {
        color: {
            kind: 'color',
            enabled: hasTextColor(colorStyle.light, colorStyle.dark),
            rangeType: rangeResolver.normaliseRangeType(options.colorType),
            style: colorStyle
        },
        glow: {
            kind: 'glow',
            enabled: !!glowStyle,
            rangeType: rangeResolver.normaliseRangeType(options.glowType),
            style: glowStyle
        },
        glass: {
            kind: 'glass',
            enabled: hasGlassStyle(glassLight, glassDark),
            rangeType: rangeResolver.normaliseRangeType(options.glassType),
            style: {
                light: glassLight,
                dark: glassDark,
                borderRadius: explicitGlassStyle.borderRadius || (presetGlassStyle ? presetGlassStyle.borderRadius : undefined)
            }
        },
        font: {
            kind: 'font',
            enabled: hasFontStyle(fontStyle.light, fontStyle.dark),
            rangeType: rangeResolver.normaliseRangeType(options.fontType),
            style: fontStyle
        }
    };

    Object.keys(channels).forEach(function (key) {
        if (channels[key].rangeType === undefined) {
            channels[key].rangeType = 'none';
        }
        if (channels[key].rangeType === 'none') {
            channels[key].enabled = false;
        }
    });

    return channels;
}

module.exports.resolveSchemeFlags = resolveSchemeFlags;
module.exports.buildChannels = buildChannels;
