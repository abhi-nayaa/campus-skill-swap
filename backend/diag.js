const fs = require('fs');
const path = require('path');

function requireDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            requireDir(fullPath);
        } else if (file.endsWith('.js')) {
            console.log(`Checking file: ${file}`);
            require(fullPath);
        }
    });
}

console.log('Starting diagnostic check...');
try {
    requireDir(path.join(__dirname, 'models'));
    requireDir(path.join(__dirname, 'utils'));
    requireDir(path.join(__dirname, 'middleware'));
    requireDir(path.join(__dirname, 'controllers'));
    requireDir(path.join(__dirname, 'routes'));
} catch (globalErr) {
    console.error('Global check error:', globalErr);
}
console.log('Diagnostic check complete!');
