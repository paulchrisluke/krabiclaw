// Loaded via `node --import` before test files run (see package.json's test:unit script).
// Registers the `~`/`~~` alias resolution hook from alias-hooks.mjs so unit tests can
// `await import(...)` server/utils files that use Nuxt's `~/...` root-alias imports.
import { register } from 'node:module'

register('./alias-hooks.mjs', import.meta.url)
