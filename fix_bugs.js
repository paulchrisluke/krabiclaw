const fs = require('fs');
const glob = require('glob');

// Fix Saya -> site.title || 'KrabiClaw' or whatever the site title is
// Actually, I can just replace `|| 'Saya'` with `|| 'Pottery House'` since the site is Pottery House.
// Wait, better yet, `unref(site)?.title || 'KrabiClaw'`
const replaceInFile = (file, search, replace) => {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes(search)) {
    fs.writeFileSync(file, content.split(search).join(replace));
    console.log('Fixed', file, 'for', search);
  }
};

const locationsFiles = glob.sync('pages/locations/**/*.vue');
locationsFiles.forEach(f => {
  replaceInFile(f, "|| 'Saya'", "|| (site as ApiValue)?.title || 'KrabiClaw'");
  replaceInFile(f, "unref(site)?.name || 'Saya'", "unref(site)?.title || 'KrabiClaw'");
  replaceInFile(f, "(site as ApiValue)?.name || 'Saya'", "(site as ApiValue)?.title || 'KrabiClaw'");
});

// Fix DOMPurify
const vueFiles = glob.sync('pages/**/*.vue');
vueFiles.forEach(f => {
  if (f.includes('experiences/')) return;
  
  let content = fs.readFileSync(f, 'utf8');
  if (content.includes('await import(\'isomorphic-dompurify\')')) {
    // We will do a generic regex replace for the top level await
    // Actually, it's easier to just comment it out and handle it properly if used, or replace with onMounted.
    // Let's see which files actually USE DOMPurify.
    console.log(f, 'has DOMPurify');
  }
});
