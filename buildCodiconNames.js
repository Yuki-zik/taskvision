const fs = require('fs');
const https = require('https');
const path = require('path');

const url = 'https://raw.githubusercontent.com/microsoft/vscode-codicons/main/src/template/mapping.json';
const outputFile = path.join(__dirname, 'src', 'codiconNames.js');

console.log(`Fetching codicon mapping from ${url}...`);

https.get(url, (res) => {
    let data = '';

    if (res.statusCode !== 200) {
        failBuild(`Failed to fetch codicons: Status Code ${res.statusCode}`);
        res.resume();
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
            failBuild('Error parsing JSON: ' + e.message);
        }
    });

}).on('error', (err) => {
    failBuild('Error fetching codicons: ' + err.message);
});

function failBuild(message) {
    console.error(message);
    process.exitCode = 1;
}
