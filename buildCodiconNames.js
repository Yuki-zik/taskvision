const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://raw.githubusercontent.com/microsoft/vscode-codicons/main/src/template/mapping.json';
const outputFile = path.join(__dirname, 'src', 'codiconNames.js');

console.log(`Fetching codicon mapping from ${url}...`);

https.get(url, (res) => {
    let data = '';

    if (res.statusCode !== 200) {
        console.error(`Failed to fetch codicons: Status Code ${res.statusCode}`);
        // Fallback or exit? For now, let's just create a minimal valid file to allow build to pass
        writeMinimalFile();
        return;
    }

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const mapping = JSON.parse(data);
            const keys = Object.keys(mapping);
            const fileContent = `module.exports = ${JSON.stringify(keys, null, 4)};\n`;

            fs.writeFileSync(outputFile, fileContent);
            console.log(`Successfully wrote ${keys.length} codicon names to ${outputFile}`);
        } catch (e) {
            console.error('Error parsing JSON:', e.message);
            writeMinimalFile();
        }
    });

}).on('error', (err) => {
    console.error('Error fetching codicons:', err.message);
    writeMinimalFile();
});

function writeMinimalFile() {
    console.log('Writing minimal codiconNames.js due to fetch failure.');
    // Write a minimal valid file so the extension can still build
    const minimalContent = "module.exports = ['add', 'alert', 'check', 'close', 'edit', 'gear', 'info', 'issue-opened', 'issue-closed', 'list-tree', 'lock', 'pass', 'play', 'refresh', 'search', 'trash', 'warning', 'workspace-trusted'];\n";
    fs.writeFileSync(outputFile, minimalContent);
}
