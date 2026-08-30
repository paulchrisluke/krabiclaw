import { readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

const db = new Database(':memory:')
try {
  db.exec(readFileSync('migrations/0000_epoch_3_baseline.sql', 'utf8'))
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  const signatures = new Map()
  for (const { name: table } of tables) {
    for (const index of db.pragma(`index_list(${JSON.stringify(table)})`)) {
      if (index.origin !== 'c') continue
      const columns = db.pragma(`index_info(${JSON.stringify(index.name)})`).map(column => column.name).join(',')
      const definition = db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?").get(index.name)?.sql ?? ''
      const where = definition.match(/\bWHERE\b[\s\S]*$/i)?.[0].replace(/\s+/g, ' ').trim() ?? ''
      const signature = `${table}\0${columns}\0${where}`
      const names = signatures.get(signature) ?? []
      names.push(index.name)
      signatures.set(signature, names)
    }
  }
  const duplicates = [...signatures.values()].filter(names => names.length > 1)
  if (duplicates.length) throw new Error(`Duplicate index definitions: ${duplicates.map(names => names.join(', ')).join('; ')}`)

  const cases = [
    {
      name: 'media placement ordered owner lookup',
      sql: "SELECT * FROM media_placements WHERE site_id=? AND owner_type=? AND owner_id=? AND slot=? ORDER BY sort_order",
      params: ['site', 'experience', 'experience', 'gallery'],
      index: 'media_placements_site_owner_slot_order_unique',
    },
    {
      name: 'site link page lookup',
      sql: 'SELECT * FROM site_link_pages WHERE site_id=?',
      params: ['site'],
      index: 'site_link_pages_site_id_unique',
    },
  ]
  for (const audit of cases) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${audit.sql}`).all(...audit.params).map(row => row.detail).join(' | ')
    if (!plan.includes(audit.index)) throw new Error(`${audit.name} did not select ${audit.index}: ${plan}`)
  }
  console.log(`Epoch-3 index audit passed (${signatures.size} definitions, ${cases.length} planner shapes).`)
} finally {
  db.close()
}
