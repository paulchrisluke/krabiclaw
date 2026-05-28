const fs = require('fs');
const glob = require('glob');

const replaceInFile = (file, replaceFn) => {
  const content = fs.readFileSync(file, 'utf8');
  const newContent = replaceFn(content);
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log('Fixed DOMPurify in', file);
  }
};

const vueFiles = glob.sync('pages/**/*.vue');
vueFiles.forEach(f => {
  replaceInFile(f, (content) => {
    if (!content.includes('isomorphic-dompurify')) return content;
    
    // Remove the bad import line
    let result = content.replace(/const DOMPurify = import\.meta\.client \? \(await import\('isomorphic-dompurify'\)\)\.default : \{ sanitize: [^}]+\}/g, '');
    
    // Replace computed sanitization with useSanitizedHtml
    result = result.replace(/const (\w+) = computed\(\(\) => DOMPurify\.sanitize\(([^)]+)\)\)/g, 'const $1 = useSanitizedHtml(() => $2)');
    
    // Replace multi-line computed sanitization
    result = result.replace(/const (\w+) = computed\(\(\) => \{\n\s*const raw = ([^\n]+)\n\s*if \(\!raw\) return ''\n\s*return DOMPurify\.sanitize\(raw\)\n\}\)/g, 'const $1 = useSanitizedHtml(() => $2)');
    
    // Some are slightly different
    result = result.replace(/const (\w+) = computed\(\(\) => \{\n\s*if \(\!([^)]+)\) return ''\n\s*return DOMPurify\.sanitize\(\2\)\n\}\)/g, 'const $1 = useSanitizedHtml(() => $2)');
    
    return result;
  });
});
