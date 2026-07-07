const fs = require('fs');
const candidates = [
  '.output/server/chunks/nitro/nitro.mjs',
  '.output/server/chunks/_/nitro.mjs',
];
const p = candidates.find((candidate) => fs.existsSync(candidate));
if (!p) {
  throw new Error(`Unable to find Nitro server chunk. Checked: ${candidates.join(', ')}`);
}
const src = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, src.replace(/Reflect\.get\(([a-z]),([a-z]),(?!\1)([a-z])\)/g, (_, t, r) => 'Reflect.get('+t+','+r+','+t+')'));
console.log(`Patched successfully: ${p}`);
