
const utils = require('./utils');
const assert = require('assert');

// Mock config
const mockConfig = {
    tags: () => ['TODO', '[ ]', '[x]'],
    regex: () => ({
        regex: '($TAGS)', // Standard regex pattern
        caseSensitive: true,
        multiLine: false
    }),
    subTagRegex: () => '^\s*:?\s*(@[a-zA-Z0-9_+-]+)', // Default subtag regex
    isRegexCaseSensitive: () => true
};

utils.init(mockConfig);

// Test Cases for Issue 1
console.log('--- Testing Issue 1: [ ] and [x] highlighting ---');

const text = `
TODO: Standard todo
[ ] Unchecked item
[x] Checked item
[ ]Mixed with text
[x]Mixed with text
`;

const regex = utils.getRegexForEditorSearch(true);
console.log('Generated Regex:', regex);

let match;
while ((match = regex.exec(text)) !== null) {
    console.log(`Match found: "${match[0]}" at index ${match.index}`);
    const extracted = utils.extractTag(match[0]);
    console.log(`  Extracted Tag: "${extracted.tag}"`);
}

// Expected behavior: Should find TODO, [ ], and [x].

console.log('\n--- check escaping ---');
const tags = mockConfig.tags();
tags.forEach(tag => {
    const escaped = tag.replace(/[|{}()[\]^$+*?.-]/g, '\\$&');
    console.log(`Tag: "${tag}" -> Escaped: "${escaped}"`);
});
