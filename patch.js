const fs = require('fs');
const p = 'dist/_worker.js/chunks/nitro/nitro.mjs';
const src = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, src.replace(/Reflect\.get\(([a-z]),([a-z]),(?!\1)([a-z])\)/g, (_, t, r, s) => 'Reflect.get('+t+','+r+','+t+')'));
console.log('Patched successfully');
