const fs = require('fs');

let schema = fs.readFileSync('server/db/schema.ts', 'utf8');

function removeTable(tableName) {
    const startStr = `export const ${tableName} = sqliteTable("${tableName}", {`;
    const startIdx = schema.indexOf(startStr);
    if (startIdx === -1) {
        console.log(`Table ${tableName} not found`);
        return;
    }
    
    // Find the end of the statement. We look for ");" at the start of a line
    // or at the end of the line if there are no trailing chars.
    // It's usually `});\n` or `]);\n`
    
    let endIdx = -1;
    let openBraces = 0;
    let openParens = 0;
    let openBrackets = 0;
    let started = false;
    for (let i = startIdx; i < schema.length; i++) {
        const c = schema[i];
        if (c === '{') openBraces++;
        if (c === '}') openBraces--;
        if (c === '(') openParens++;
        if (c === ')') openParens--;
        if (c === '[') openBrackets++;
        if (c === ']') openBrackets--;
        
        if (openBraces > 0 || openParens > 0 || openBrackets > 0) {
            started = true;
        }
        
        if (started && openBraces === 0 && openParens === 0 && openBrackets === 0) {
            // Check if next is ;
            if (schema[i] === ';') {
                endIdx = i;
                break;
            }
            if (schema[i+1] === ';') {
                endIdx = i + 1;
                break;
            }
        }
    }
    if (endIdx !== -1) {
        // remove up to endIdx + newline
        let after = endIdx + 1;
        if (schema[after] === '\n') after++;
        schema = schema.slice(0, startIdx) + schema.slice(after);
    }
}

removeTable('business_location_translations');
removeTable('menu_item_translations');
removeTable('menu_translations');
removeTable('post_translations');
removeTable('content_revisions');

// 3. Drop status from site_locales
schema = schema.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/g, '');
schema = schema.replace(/\tcheck\("site_locales_status_check", sql`status IN \('draft', 'published', 'disabled'\)`\),\n/g, '');
schema = schema.replace(/\tindex\("site_locales_site_status_idx"\)\.on\(table\.site_id, table\.status\),\n/g, '');

// 4. Drop status from menus
schema = schema.replace(/\tstatus: text\(\)\.default\("draft"\)\.notNull\(\),\n/g, ''); // Wait, this will drop ALL statuses not just menus if I just replace globally.
// I should scope the replacement.
