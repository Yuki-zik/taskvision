var utils = require('./utils.js');

var schemes = {
    "neon": {},
    "glass": {},
    "neon+glass": {}
};

function applyScheme(options, schemeName, lightBaseColor, darkBaseColor, type) {
    // Helper to ensure valid hex color for CSS injection
    var resolveColor = function (color, defaultColor) {
        if (!color || typeof color !== 'string') return defaultColor;
        if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('var')) return color;
        return defaultColor;
    };

    // Apply sensible defaults: use a vivid accent if no color was resolved
    var defaultAccent = "#42A5F5"; // Default blue accent
    lightBaseColor = resolveColor(lightBaseColor, defaultAccent);
    darkBaseColor = resolveColor(darkBaseColor, lightBaseColor);

    var hasNeon = (schemeName === 'neon' || schemeName === 'neon+glass');
    var hasGlass = (schemeName === 'glass' || schemeName === 'neon+glass');
    var secondaryOptions = undefined;

    // Common settings for all modern schemes
    options.borderRadius = "6px";
    if (options.light) options.light.fontWeight = "bold";
    if (options.dark) options.dark.fontWeight = "bold";

    // Strictly respect the configured type for isWholeLine behavior
    if (typeof type === 'string' && (type === 'whole-line' || type === 'line')) {
        options.isWholeLine = true;
    } else {
        options.isWholeLine = false;
    }

    // --- Special Handling for Combined Neon + Glass ---
    // If combined mode is active AND the user wants "Tag Only" (isWholeLine=false),
    // we must split the effects into two decorations:
    // 1. Primary (options): Glass Background -> Forced to Whole Line
    // 2. Secondary: Neon Text Effect -> Component Scope (Tag)
    if (schemeName === 'neon+glass' && options.isWholeLine === false) {
        // Force primary (Background) to be whole line
        options.isWholeLine = true;

        // Create secondary options for the text effect (keeps isWholeLine=false)
        secondaryOptions = Object.assign({}, options);
        if (options.light) {
            secondaryOptions.light = Object.assign({}, options.light);
        }
        if (options.dark) {
            secondaryOptions.dark = Object.assign({}, options.dark);
        }
        secondaryOptions.isWholeLine = false;

        // Primary: Glass Background ONLY (Fixes Issue 2: Gray Text / Bleed)
        // We REMOVE the text color from here so it doesn't bleed to the whole line.
        // The text color will be handled by the secondary decoration.
        if (options.light) {
            delete options.light.fontWeight;
            if (options.light.color) delete options.light.color;
        }
        if (options.dark) {
            delete options.dark.fontWeight;
            if (options.dark.color) delete options.dark.color;
        }

        // Secondary: Neon Text only, NO background (Fixes Issue 1: Clean Separation)
        if (secondaryOptions.light) {
            secondaryOptions.light.backgroundColor = 'transparent';
            secondaryOptions.light.border = 'none';
            // Secondary should have the glow (textDecoration) and color
        }
        if (secondaryOptions.dark) {
            secondaryOptions.dark.backgroundColor = 'transparent';
            secondaryOptions.dark.border = 'none';
        }

        // Apply Glass to Primary
        if (hasGlass) {
            var glassOpacity = 20; // Increased visibility for whole-line background
            var glassBorderOpacity = 40;
            if (lightBaseColor) {
                options.light.backgroundColor = utils.hexToRgba(lightBaseColor, glassOpacity);
                options.light.border = "1px solid " + utils.hexToRgba(lightBaseColor, glassBorderOpacity);
            }
            if (darkBaseColor) {
                options.dark.backgroundColor = utils.hexToRgba(darkBaseColor, glassOpacity);
                options.dark.border = "1px solid " + utils.hexToRgba(darkBaseColor, glassBorderOpacity);
            }
        }

        // Apply Neon to Secondary
        if (hasNeon) {
            if (lightBaseColor) {
                secondaryOptions.light.color = lightBaseColor;
                secondaryOptions.light.textDecoration = `none; text-shadow: 0 0 5px ${lightBaseColor}, 0 0 10px ${lightBaseColor}, 0 0 15px ${lightBaseColor}; font-weight: bold;`;
            }
            if (darkBaseColor) {
                secondaryOptions.dark.color = darkBaseColor;
                secondaryOptions.dark.textDecoration = `none; text-shadow: 0 0 5px ${darkBaseColor}, 0 0 10px ${darkBaseColor}, 0 0 15px ${darkBaseColor}; font-weight: bold;`;
            }
        }

        return secondaryOptions;
    }

    // --- Standard Single-Decoration Logic (Original) ---
    // If not splitting, apply effects normally to the single 'options' object

    // ... (Glass effect logic)
    if (hasGlass) {
        var glassOpacity = 15;
        var glassBorderOpacity = 40;

        if (lightBaseColor) {
            options.light.backgroundColor = utils.hexToRgba(lightBaseColor, glassOpacity);
            options.light.border = "1px solid " + utils.hexToRgba(lightBaseColor, glassBorderOpacity);
        }
        if (darkBaseColor) {
            options.dark.backgroundColor = utils.hexToRgba(darkBaseColor, glassOpacity);
            options.dark.border = "1px solid " + utils.hexToRgba(darkBaseColor, glassBorderOpacity);
        }
    }

    // ... (Neon effect logic)
    // ... (Neon effect logic)
    if (hasNeon) {
        var neonOpacity = hasGlass ? 0 : 10;
        var neonBorderOpacity = hasGlass ? 0 : 50;

        if (lightBaseColor) {
            if (!hasGlass) {
                options.light.backgroundColor = utils.hexToRgba(lightBaseColor, neonOpacity);
                options.light.border = "1px solid " + utils.hexToRgba(lightBaseColor, neonBorderOpacity);
            }
            // For whole-line, DO NOT apply color to primary (options)
            if (!options.isWholeLine) {
                options.light.color = lightBaseColor;
                options.light.textDecoration = `none; text-shadow: 0 0 5px ${lightBaseColor}, 0 0 10px ${lightBaseColor}, 0 0 15px ${lightBaseColor}; font-weight: bold;`;
            } else {
                // But we DO need to return a secondary options with the color/effect?
                // Wait, highlights.js creates simpleSecondary for whole-line.
                // If we return undefined here, simpleSecondary is used.
                // But applyScheme is void? No, it returns secondaryOptions (undefined by default).
                // If we want Scheme Effects on whole-line, we need to return them as secondary.
                if (!secondaryOptions) secondaryOptions = { light: {}, dark: {}, isWholeLine: false, rangeBehavior: 1 };
                secondaryOptions.light.color = lightBaseColor;
                secondaryOptions.light.textDecoration = `none; text-shadow: 0 0 5px ${lightBaseColor}, 0 0 10px ${lightBaseColor}, 0 0 15px ${lightBaseColor}; font-weight: bold;`;
            }
        }
        if (darkBaseColor) {
            if (!hasGlass) {
                options.dark.backgroundColor = utils.hexToRgba(darkBaseColor, neonOpacity);
                options.dark.border = "1px solid " + utils.hexToRgba(darkBaseColor, neonBorderOpacity);
            }
            if (!options.isWholeLine) {
                options.dark.color = darkBaseColor;
                options.dark.textDecoration = `none; text-shadow: 0 0 5px ${darkBaseColor}, 0 0 10px ${darkBaseColor}, 0 0 15px ${darkBaseColor}; font-weight: bold;`;
            } else {
                if (!secondaryOptions) secondaryOptions = { light: {}, dark: {}, isWholeLine: false, rangeBehavior: 1 }; // Ensure exists
                secondaryOptions.dark.color = darkBaseColor;
                secondaryOptions.dark.textDecoration = `none; text-shadow: 0 0 5px ${darkBaseColor}, 0 0 10px ${darkBaseColor}, 0 0 15px ${darkBaseColor}; font-weight: bold;`;
            }
        }
    } else if (hasGlass) {
        if (lightBaseColor) {
            if (!options.isWholeLine) {
                options.light.color = lightBaseColor;
                options.light.textDecoration = "none; font-weight: bold;";
            } else {
                if (!secondaryOptions) secondaryOptions = { light: {}, dark: {}, isWholeLine: false, rangeBehavior: 1 };
                secondaryOptions.light.color = lightBaseColor;
                secondaryOptions.light.textDecoration = "none; font-weight: bold;";
            }
        }
        if (darkBaseColor) {
            if (!options.isWholeLine) {
                options.dark.color = darkBaseColor;
                options.dark.textDecoration = "none; font-weight: bold;";
            } else {
                if (!secondaryOptions) secondaryOptions = { light: {}, dark: {}, isWholeLine: false, rangeBehavior: 1 };
                secondaryOptions.dark.color = darkBaseColor;
                secondaryOptions.dark.textDecoration = "none; font-weight: bold;";
            }
        }
    }

    return secondaryOptions;
}

module.exports.applyScheme = applyScheme;
