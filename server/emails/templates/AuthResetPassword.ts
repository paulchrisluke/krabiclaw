import { defineComponent, h } from 'vue'
import { ESection, EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    resetUrl: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: 'Reset your KrabiClaw password.',
      title: 'Reset your password',
      ctaUrl: props.resetUrl,
      ctaText: 'Choose a new password',
      platformDomain: props.platformDomain,
      footerNote: 'If you did not request a password reset, you can safely ignore this email.',
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () =>
        'We received a request to reset your KrabiClaw password. Use the secure link below to choose a new one.',
      ),
      h(EText, { style: 'margin:0;font-size:14px;color:#71717a;line-height:1.6' }, () => [
        'If the button above does not open, copy and paste this link into your browser:',
      ]),
      h(ESection, { style: 'padding-top:16px' }, () => [
        h(ELink, {
          href: props.resetUrl,
          style: 'font-size:13px;word-break:break-all;color:#E87F67;text-decoration:underline',
        }, () => props.resetUrl),
      ]),
    ])
  },
})
