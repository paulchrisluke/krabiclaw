// Node module customization hook that resolves Nuxt's `~`/`~~` root aliases
// (see .nuxt/tsconfig.json's `paths` map, both point at the repo root) the same
// way Nuxt's bundler does, so plain `node --test` can import server/utils files
// that use `~/...` imports without rewriting them to relative paths just for
// testability. Registered via tests/unit/support/register-aliases.mjs.
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(fileURLToPath(import.meta.url), '../../../../')

// Bare '' must only match a *file* (e.g. an extensionless specifier some callers write out
// in full), never a directory — a directory needs one of the '/index.*' suffixes below, or
// Node's ESM loader rejects it with ERR_UNSUPPORTED_DIR_IMPORT.
const CANDIDATE_SUFFIXES = ['', '.ts', '.mts', '.js', '.mjs', '/index.ts', '/index.mts', '/index.js']

function isFile(candidate) {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

function resolveAliasedPath(specifier) {
  const isTilde = specifier === '~' || specifier.startsWith('~/')
  const isDoubleTilde = specifier === '~~' || specifier.startsWith('~~/')
  if (!isTilde && !isDoubleTilde) return null

  const rest = isDoubleTilde ? specifier.slice(2) : specifier.slice(1)
  const basePath = path.join(rootDir, rest)

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${basePath}${suffix}`
    if (existsSync(candidate) && isFile(candidate)) return candidate
  }

  return null
}

// Nuxt's bundler (and TypeScript's moduleResolution) resolves extensionless
// relative specifiers like './whatsapp-delivery' against the importing file's
// own directory. Node's plain ESM loader requires an explicit extension for
// relative specifiers, so any server/utils file written the normal
// (bundler-resolved) way fails under `node --test` the moment a test
// transitively imports it — this hit server/utils/whatsapp.ts's import of
// './whatsapp-delivery' via server/utils/customers.ts. Only handle bare/no
// extension relative specifiers here; leave everything Node already resolves
// (explicit extensions, bare package specifiers) to the default resolver.
function resolveRelativePath(specifier, parentURL) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  if (!isRelative || !parentURL) return null
  if (/\.[a-zA-Z0-9]+$/.test(specifier)) return null // already has an extension

  const parentDir = path.dirname(fileURLToPath(parentURL))
  const basePath = path.join(parentDir, specifier)

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${basePath}${suffix}`
    if (existsSync(candidate) && isFile(candidate)) return candidate
  }

  return null
}

export async function resolve(specifier, context, nextResolve) {
  const resolvedPath = resolveAliasedPath(specifier) ?? resolveRelativePath(specifier, context.parentURL)
  if (resolvedPath) {
    return nextResolve(pathToFileURL(resolvedPath).href, context)
  }
  return nextResolve(specifier, context)
}
