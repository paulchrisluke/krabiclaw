import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const authPages = [
  { page: 'pages/login.vue', emailComponent: '<AuthEmailSignInForm' },
  { page: 'pages/oauth/login.vue', emailComponent: '<AuthEmailSignInForm' },
  { page: 'pages/signup.vue', emailComponent: '<AuthEmailSignUpForm' },
]

for (const { page, emailComponent } of authPages) {
  test(`${page} presents Google, WhatsApp, then email authentication`, () => {
    const source = readFileSync(page, 'utf8')
    const google = source.indexOf('<AuthGoogleAuthButton')
    const whatsapp = source.indexOf('<WhatsAppAuthButton')
    const email = source.indexOf(emailComponent)

    assert.ok(google >= 0, 'Google sign-in is present')
    assert.ok(whatsapp > google, 'WhatsApp follows Google')
    assert.ok(email > whatsapp, 'email sign-in follows WhatsApp')
  })
}
