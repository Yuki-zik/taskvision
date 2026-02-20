
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'highlights.js');
const content = fs.readFileSync(filePath, 'utf8');

let openBraces = 0;
let lines = content.split('\n');
let stack = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 580) {
        console.log(`Stack at line 580: depth=${openBraces}`, stack);
    }
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{') {
            openBraces++;
            stack.push({ line: i + 1, char: j + 1 });
        } else if (char === '}') {
            const lastOpen = stack.length > 0 ? stack[stack.length - 1] : 'NONE';
            // console.log(`Closing brace at ${i+1}:${j+1}. Matches open at ${lastOpen.line}:${lastOpen.char}. Stack depth: ${stack.length}`);
            openBraces--;
            if (openBraces < 0) {
                console.log('Negative brace count at line ' + (i + 1) + ', column ' + (j + 1));
                return;
            }
            if (stack.length > 0) stack.pop();
        }
    }
}

console.log('Final open braces count:', openBraces);
if (openBraces > 0) {
    console.log('Unclosed braces remaining. Last opened at:', stack[stack.length - 1]);
} else if (openBraces < 0) {
    console.log('Too many closing braces.');
} else {
    console.log('Braces are balanced.');
}
