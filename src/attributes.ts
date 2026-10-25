import type { AttributeConfiguration, HighlightSettings } from './model';
let config: AttributeConfiguration;

const highlightRegexCache: Record<string, RegExp | null> = {};

function init(configuration: AttributeConfiguration) {
    config = configuration;
}

function getAttribute<K extends keyof HighlightSettings>(tag: string, attribute: K, defaultValue: HighlightSettings[K], ignoreDefaultHighlight?: boolean): HighlightSettings[K] {
    function getCustomHighlightSettings(customHighlight: Record<string, HighlightSettings>, tag: string) {
        if (!customHighlight) return undefined;

        if (customHighlight[tag] !== undefined) {
            return customHighlight[tag];
        }

        let result: HighlightSettings | undefined;
        Object.keys(customHighlight).forEach(function (t) {
            let flags = '';
            if (config.isRegexCaseSensitive() === false) {
                flags += 'i';
            }
            const escapedT = t.replace(/\\/g, '\\\\').replace(/[|{}()[\]^$+*?.-]/g, '\\$&');

            const cacheKey = escapedT + ' ' + flags;
            let regex = highlightRegexCache[cacheKey];
            if (regex === undefined) {
                try {
                    regex = new RegExp(escapedT, flags);
                } catch (e) {
                    // Ignore improperly formed dynamic regexes
                    regex = null;
                }
                highlightRegexCache[cacheKey] = regex;
            }

            if (regex && tag.match(regex)) {
                result = customHighlight[t];
            }
        });
        return result;
    }

    const tagSettings = getCustomHighlightSettings(config.customHighlight(), tag);
    if (tagSettings && tagSettings[attribute] !== undefined) {
        return tagSettings[attribute];
    }
    else if (ignoreDefaultHighlight !== true) {
        const defaultHighlight = config.defaultHighlight();
        if (defaultHighlight[attribute] !== undefined) {
            return defaultHighlight[attribute];
        }
    }
    return defaultValue;
}

function getIcon(tag: string) {
    return getAttribute(tag, 'icon', undefined);
}

function getIconColour(tag: string) {
    const useColourScheme = config.shouldUseColourScheme();

    let colour = getAttribute(tag, 'iconColor', undefined);
    if (colour === undefined) {
        colour = getAttribute(tag, 'iconColour', undefined, useColourScheme);
    }
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, config.backgroundColourScheme());
    }

    if (colour === undefined) {
        const foreground = getAttribute(tag, 'foreground', undefined, useColourScheme);
        const background = getAttribute(tag, 'background', undefined, useColourScheme);

        colour = foreground ? foreground : (background ? background : "green");
    }

    return colour;
}

function getSchemeColour(tag: string, colours: string[]) {
    const index = config.tags().indexOf(tag);
    if (colours && colours.length > 0) {
        return colours[index % colours.length];
    }
}

function getForeground(tag: string) {
    const useColourScheme = config.shouldUseColourScheme();
    let colour = getAttribute(tag, 'foreground', undefined, useColourScheme);
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, config.foregroundColourScheme());
    }
    return colour;
}

function getBackground(tag: string) {
    const useColourScheme = config.shouldUseColourScheme();
    let colour = getAttribute(tag, 'background', undefined, useColourScheme);
    if (colour === undefined && useColourScheme) {
        colour = getSchemeColour(tag, config.backgroundColourScheme());
    }
    return colour;
}

function getOpacity(tag: string) {
    return getAttribute(tag, 'opacity', undefined);
}

function getRulerColour(tag: string) {
    return getAttribute(tag, 'rulerColour', undefined);
}

function getRulerLane(tag: string) {
    return getAttribute(tag, 'rulerLane', undefined);
}

function getBorderRadius(tag: string) {
    return getAttribute(tag, 'borderRadius', undefined);
}

function getScheme(tag: string) {
    return getAttribute(tag, 'scheme', undefined);
}

export { init, getAttribute, getIcon, getIconColour, getForeground, getBackground, getOpacity, getRulerColour, getRulerLane, getBorderRadius, getScheme };
