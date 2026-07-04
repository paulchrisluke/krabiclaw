import { resolve, relative } from 'node:path'
import { promises as fs } from 'node:fs'
import { defineNuxtModule } from '@nuxt/kit'
import { colorize } from 'consola/utils'
import { findFile } from 'pkg-types'

export default defineNuxtModule({
  meta: {
    name: 'krabiclaw-cloudflare-dev',
  },
  async setup(_, nuxt) {
    nuxt.hook('nitro:config', async (nitroConfig) => {
      if (!nitroConfig.dev) return

      let configPath = nitroConfig.cloudflareDev?.configPath
      if (!configPath) {
        configPath = await findFile(
          ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'],
          { startingFrom: nitroConfig.srcDir },
        ).catch(() => undefined)
      }

      const persistDir = resolve(
        nitroConfig.rootDir || '.',
        nitroConfig.cloudflareDev?.persistDir || '.wrangler/state/v3',
      )

      const gitIgnorePath = await findFile('.gitignore', {
        startingFrom: nitroConfig.rootDir,
      }).catch(() => undefined)

      const isDefaultPersistDir = !nitroConfig.cloudflareDev?.persistDir || nitroConfig.cloudflareDev.persistDir === '.wrangler/state/v3'
      if (gitIgnorePath && isDefaultPersistDir) {
        const gitIgnore = await fs.readFile(gitIgnorePath, 'utf8')
        if (!gitIgnore.includes('.wrangler/state/v3')) {
          await fs.writeFile(gitIgnorePath, `${gitIgnore}\n.wrangler/state/v3\n`).catch(() => {})
        }
      }

      if (!nitroConfig.cloudflareDev?.silent) {
        console.log([
          'Cloudflare context bindings enabled for dev server',
          `Config path: ${configPath ? `\`${relative('.', configPath)}\`` : colorize('yellow', 'missing wrangler config')}`,
          `Persist dir: \`${relative('.', persistDir)}\``,
        ].join('\n'))
      }

      nitroConfig.runtimeConfig = nitroConfig.runtimeConfig || {}
      nitroConfig.runtimeConfig.wrangler = {
        ...(nitroConfig.runtimeConfig.wrangler || {}),
        configPath,
        persistDir,
        environment: nitroConfig.cloudflareDev?.environment,
        // Default to local-only bindings so tenant dev does not depend on a
        // remote Workers AI proxy session. Opt back in explicitly when needed.
        remoteBindings: process.env.NUXT_CF_REMOTE_BINDINGS === 'true',
      }

      nitroConfig.externals = nitroConfig.externals || {}
      nitroConfig.externals.external = [
        ...(nitroConfig.externals.external || []),
        'wrangler',
      ]

      nitroConfig.plugins = nitroConfig.plugins || []
      nitroConfig.plugins.push(resolve(nitroConfig.rootDir || '.', 'build/runtime/cloudflare-bindings-dev.ts'))
    })
  },
})
