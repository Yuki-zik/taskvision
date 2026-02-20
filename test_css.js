const composer = require('./src/styleComposer');
const highlightChannels = require('./src/highlightChannels');
const schemes = require('./src/schemes');

const tag = 'FIXME';
const schemeName = 'neon+glass';
const foregroundColour = '#FFFFFF';
const backgroundColour = '#9C27B066'; // from config
const baseColor = '#9C27B0';
const schemePreset = schemes.getPreset(schemeName, baseColor, baseColor);

let lightForegroundColour = foregroundColour;
let darkForegroundColour = foregroundColour;

if (schemeName && foregroundColour === undefined) {
    lightForegroundColour = schemePreset.lightColor;
    darkForegroundColour = schemePreset.darkColor;
}

const channels = highlightChannels.buildChannels({
    scheme: schemeName,
    colorType: 'text',
    glowType: 'tag',
    glassType: 'whole-line',
    fontType: 'tag',
    lightForegroundColour: lightForegroundColour,
    darkForegroundColour: darkForegroundColour,
    lightBackgroundColour: backgroundColour,
    darkBackgroundColour: backgroundColour,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textDecoration: undefined,
    schemePreset: schemePreset
});

const fontStyle = composer.composeTextStyle({
    color: channels.color.style,
    font: channels.font.style,
    glow: channels.glow.style
});

console.log("Channels:", JSON.stringify(channels, null, 2));
console.log("Final font style:", JSON.stringify(fontStyle, null, 2));

