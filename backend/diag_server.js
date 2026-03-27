const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('node', ['server.js'], { cwd: 'c:/Users/abhin/Campus skill swap/backend' });

let output = '';
child.stdout.on('data', (data) => {
    output += data.toString();
});

child.stderr.on('data', (data) => {
    output += data.toString();
});

child.on('close', (code) => {
    output += `\nProcess exited with code ${code}\n`;
    fs.writeFileSync('c:/Users/abhin/Campus skill swap/backend/full_error.log', output);
    console.log('Error logged to full_error.log');
});
