const fs = require('fs');
const glob = require('glob');

const replaceInFile = (file, search, replace) => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(search)) {
    fs.writeFileSync(file, content.split(search).join(replace));
    console.log('Fixed Saya in', file);
  }
};

const locationsFiles = glob.sync('pages/locations/**/*.vue');
locationsFiles.forEach(f => {
  replaceInFile(f, "|| 'Saya'", "|| (site as ApiValue)?.title || 'KrabiClaw'");
  replaceInFile(f, "unref(site)?.name || 'Saya'", "unref(site)?.title || 'KrabiClaw'");
  replaceInFile(f, "(site as ApiValue)?.name || 'Saya'", "(site as ApiValue)?.title || 'KrabiClaw'");
});
