import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveSubdomain,
  getFreeSiteDomain,
  getPlatformHosts,
  hostnameOf,
  isPlatformHost,
  normalizeHost,
  type TenantHostEnv,
} from '../../server/utils/tenant-hosts.ts'

const prodEnv: TenantHostEnv = {
  NUXT_PUBLIC_FREE_SITE_DOMAIN: 'krabiclaw.com',
  NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com',
}

const localEnv: TenantHostEnv = {
  NUXT_PUBLIC_FREE_SITE_DOMAIN: 'http://localhost:3000',
  NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com',
}

const portedCustomEnv: TenantHostEnv = {
  NUXT_PUBLIC_FREE_SITE_DOMAIN: 'http://myapp.example.com:3000',
  NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com',
}

test('normalizeHost strips protocol, trailing slash and port', () => {
  assert.equal(normalizeHost('https://krabiclaw.com'), 'krabiclaw.com')
  assert.equal(normalizeHost('http://localhost:3000'), 'localhost')
  assert.equal(normalizeHost('http://localhost:3000/'), 'localhost')
  assert.equal(normalizeHost('krabiclaw.com'), 'krabiclaw.com')
  assert.equal(normalizeHost(''), '')
  assert.equal(normalizeHost(undefined), '')
})

test('hostnameOf strips the port from a Host header', () => {
  assert.equal(hostnameOf('localhost:3000'), 'localhost')
  assert.equal(hostnameOf('127.0.0.1:3000'), '127.0.0.1')
  assert.equal(hostnameOf('krabiclaw.com'), 'krabiclaw.com')
  assert.equal(hostnameOf(''), '')
})

test('getPlatformHosts always includes localhost, loopback and the documented production domains', () => {
  // CLAUDE.md "Multi-Tenancy": "localhost / krabiclaw.com = platform routes"
  for (const env of [prodEnv, localEnv, {}]) {
    const hosts = getPlatformHosts(env)
    assert.ok(hosts.includes('localhost'))
    assert.ok(hosts.includes('127.0.0.1'))
    assert.ok(hosts.includes('krabiclaw.com'))
    assert.ok(hosts.includes('www.krabiclaw.com'))
  }
})

test('getPlatformHosts folds the configured domains in without duplicates', () => {
  const hosts = getPlatformHosts(prodEnv)
  assert.equal(hosts.filter((h) => h === 'krabiclaw.com').length, 1)
})

test('isPlatformHost recognizes localhost and loopback with and without a port', () => {
  for (const env of [prodEnv, localEnv]) {
    assert.equal(isPlatformHost('localhost', env), true)
    assert.equal(isPlatformHost('localhost:3000', env), true)
    assert.equal(isPlatformHost('127.0.0.1', env), true)
    assert.equal(isPlatformHost('127.0.0.1:3000', env), true)
  }
})

test('isPlatformHost recognizes the configured platform domain with and without a port', () => {
  assert.equal(isPlatformHost('krabiclaw.com', prodEnv), true)
  assert.equal(isPlatformHost('krabiclaw.com:443', prodEnv), true)
  assert.equal(isPlatformHost('www.krabiclaw.com', prodEnv), true)
  assert.equal(isPlatformHost('www.krabiclaw.com:443', prodEnv), true)
})

test('isPlatformHost treats krabiclaw.com as a platform host even when NUXT_PUBLIC_FREE_SITE_DOMAIN points elsewhere (e.g. local/CI)', () => {
  // CLAUDE.md: "localhost / krabiclaw.com = platform routes" — this must hold
  // regardless of how the free-site domain is configured for the environment.
  assert.equal(isPlatformHost('krabiclaw.com', localEnv), true)
  assert.equal(isPlatformHost('www.krabiclaw.com', localEnv), true)
})

test('isPlatformHost rejects unrelated external hosts and tenant custom domains', () => {
  for (const env of [prodEnv, localEnv]) {
    assert.equal(isPlatformHost('example.com', env), false)
    assert.equal(isPlatformHost('pottery-house-krabi.com', env), false)
    assert.equal(isPlatformHost('pottery-house-krabi.com:8080', env), false)
    assert.equal(isPlatformHost('demo.krabiclaw.com', env), false)
  }
})

test('isPlatformHost recognizes the deployed *.pages.dev preview host', () => {
  assert.equal(isPlatformHost('krabiclaw.pages.dev', prodEnv), true)
  assert.equal(isPlatformHost('preview-123.krabiclaw.pages.dev', prodEnv), true)
})

test('isPlatformHost recognizes deployed CI preview Worker hosts on workers.dev', () => {
  assert.equal(isPlatformHost('krabiclaw-preview.paulchrisluke.workers.dev', prodEnv), true)
  assert.equal(isPlatformHost('ci-pr-1234567890-krabiclaw-preview.paulchrisluke.workers.dev', prodEnv), true)
  assert.equal(isPlatformHost('5a91b33e-krabiclaw-preview.paulchrisluke.workers.dev', prodEnv), true)
  assert.equal(isPlatformHost('some-other-worker.paulchrisluke.workers.dev', prodEnv), false)
})

test('getFreeSiteDomain normalizes the configured domain and strips its port', () => {
  assert.equal(getFreeSiteDomain(prodEnv), 'krabiclaw.com')
  assert.equal(getFreeSiteDomain(localEnv), 'localhost')
  assert.equal(getFreeSiteDomain(portedCustomEnv), 'myapp.example.com')
})

test('getFreeSiteDomain falls back to krabiclaw.com when unconfigured', () => {
  assert.equal(getFreeSiteDomain({}), 'krabiclaw.com')
})

test('deriveSubdomain matches a subdomain of the configured platform domain', () => {
  // deriveSubdomain always receives an already port-stripped hostname
  // (callers run hostnameOf() first), so only bare hostnames are exercised here.
  assert.equal(deriveSubdomain('demo.krabiclaw.com', 'krabiclaw.com'), 'demo')
})

test('deriveSubdomain ignores the www label', () => {
  assert.equal(deriveSubdomain('www.krabiclaw.com', 'krabiclaw.com'), '')
})

test('deriveSubdomain is never asked to resolve the bare platform domain (isPlatformHost intercepts it first)', () => {
  // deriveSubdomain alone would treat "krabiclaw.com" as subdomain "krabiclaw"
  // of "krabiclaw.com" — but resolveTenantSite() only runs after
  // isPlatformHost() returns false, and isPlatformHost('krabiclaw.com', ...)
  // is always true (see getPlatformHosts), so this input never reaches here.
  assert.equal(isPlatformHost('krabiclaw.com', prodEnv), true)
  assert.equal(deriveSubdomain('krabiclaw.com', 'krabiclaw.com'), 'krabiclaw')
})

test('deriveSubdomain handles an unrelated custom tenant domain by taking its first label', () => {
  assert.equal(deriveSubdomain('pottery-house-krabi.com', 'krabiclaw.com'), 'pottery-house-krabi')
})

test('deriveSubdomain is correct when the platform domain is configured with a port (regression: main kept the port)', () => {
  // Real bug class this guards against: if NUXT_PUBLIC_FREE_SITE_DOMAIN carries
  // a port (e.g. a non-standard local/staging config), a naive platformDomain
  // that keeps ":3000" never matches `endsWith('.myapp.example.com:3000')`,
  // so a real subdomain falls through to the wrong site_domains lookup
  // ("tenant.myapp.example.com:3000" instead of "tenant.myapp.example.com").
  const freeSiteDomain = getFreeSiteDomain(portedCustomEnv)
  assert.equal(freeSiteDomain, 'myapp.example.com')
  assert.equal(deriveSubdomain('tenant.myapp.example.com', freeSiteDomain), 'tenant')
})
