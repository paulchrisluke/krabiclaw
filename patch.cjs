const fs = require('fs');
const p = [
  '.output/server/chunks/nitro/nitro.mjs',
  '.output/server/chunks/_/nitro.mjs',
].find((candidate) => fs.existsSync(candidate));
if (!p) {
  console.log('No Nitro chunk found to patch');
  process.exit(0);
}
const src = fs.readFileSync(p, 'utf8');
fs.writeFileSync(p, src.replace(/Reflect\.get\(([a-z]),([a-z]),(?!\1)([a-z])\)/g, (_, t, r) => 'Reflect.get('+t+','+r+','+t+')'));
console.log('Patched successfully');
