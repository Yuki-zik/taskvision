
const fs = require('fs');
const lines = fs.readFileSync('src/highlights.js', 'utf8').split('\n');
let open = 0;
let out = [];
lines.forEach((line, i) => {
    let hadBrace = false;
    for (let c of line) {
        if (c === '{') { open++; hadBrace = true; }
        else if (c === '}') { open--; hadBrace = true; }
    }
    if (hadBrace) {
        out.push(`${i + 1}: ${open}   | ${line.trim()}`);
    }
});
fs.writeFileSync('brace_trace.txt', out.join('\n'), 'utf8');
