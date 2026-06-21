import { defineComponent, h } from 'vue'
import { ESection, EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    verificationUrl: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: 'Verify your email address to finish setting up your KrabiClaw account.',
      title: 'Verify your email',
      ctaUrl: props.verificationUrl,
      ctaText: 'Verify email',
      platformDomain: props.platformDomain,
      footerNote: 'If you did not create this account, you can safely ignore this email.',
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () =>
        'Confirm your email address to finish setting up your KrabiClaw account and keep your sign-in secure.',
      ),
      h(EText, { style: 'margin:0;font-size:14px;color:#71717a;line-height:1.6' }, () => [
        'If the button above does not open, copy and paste this link into your browser:',
      ]),
      h(ESection, { style: 'padding-top:16px' }, () => [
        h(ELink, {
          href: props.verificationUrl,
          style: 'font-size:13px;word-break:break-all;color:#E87F67;text-decoration:underline',
        }, () => props.verificationUrl),
      ]),
    ])
  },
})
