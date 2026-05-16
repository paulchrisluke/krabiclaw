import { execSync } from 'child_process';

const tables = ['platform_blog_posts', 'platform_docs'];
const column = 'featured_image_asset_id';

const isRemote = process.argv.includes('--remote');
const target = isRemote ? '--remote' : '--local';

for (const table of tables) {
  try {
    console.log(`Checking ${table} for ${column} (${isRemote ? 'remote' : 'local'})...`);
    const info = execSync(`npx wrangler d1 execute REVIEWS_DB ${target} --command "PRAGMA table_info(${table});" --json`).toString();
    const columns = JSON.parse(info)[0].results;
    
    if (!columns.some(c => c.name === column)) {
      console.log(`Adding ${column} to ${table}...`);
      execSync(`npx wrangler d1 execute REVIEWS_DB ${target} --command "ALTER TABLE ${table} ADD COLUMN ${column} TEXT REFERENCES media_assets(id) ON DELETE SET NULL;"`);
      console.log(`Done.`);
    } else {
      console.log(`${column} already exists in ${table}.`);
    }
  } catch (err) {
    console.error(`Failed to migrate ${table}:`, err.message);
  }
}
