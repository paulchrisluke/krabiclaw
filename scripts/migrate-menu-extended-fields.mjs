import { execSync } from 'child_process';

const table = 'menu_items';
const columns = [
  { name: 'allergens', type: 'TEXT' },
  { name: 'ingredients', type: 'TEXT' },
  { name: 'dietary_notes', type: 'TEXT' },
  { name: 'preparation', type: 'TEXT' },
  { name: 'serving_note', type: 'TEXT' }
];

const isRemote = process.argv.includes('--remote');
const target = isRemote ? '--remote' : '--local';

for (const col of columns) {
  try {
    console.log(`Checking ${table} for ${col.name} (${isRemote ? 'remote' : 'local'})...`);
    const info = execSync(`npx wrangler d1 execute REVIEWS_DB ${target} --command "PRAGMA table_info(${table});" --json`).toString();
    const existingColumns = JSON.parse(info)[0].results;
    
    if (!existingColumns.some(c => c.name === col.name)) {
      console.log(`Adding ${col.name} to ${table}...`);
      execSync(`npx wrangler d1 execute REVIEWS_DB ${target} --command "ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type};"`);
      console.log(`Done.`);
    } else {
      console.log(`${col.name} already exists in ${table}.`);
    }
  } catch (err) {
    console.error(`Failed to migrate ${col.name}:`, err.message);
  }
}
