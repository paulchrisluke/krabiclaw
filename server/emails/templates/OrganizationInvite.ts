import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    organizationName: { type: String, required: true },
    inviterName: { type: String, required: true },
    role: { type: String, required: true },
    inviteUrl: { type: String, required: true },
    platformDomain: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `${props.inviterName} invited you to join ${props.organizationName} on KrabiClaw.`,
      title: `You're invited to ${props.organizationName}`,
      ctaUrl: props.inviteUrl,
      ctaText: 'Accept invitation',
      footerNote: "Didn't expect this? You can safely ignore it — the invitation will simply expire.",
      platformDomain: props.platformDomain || 'krabiclaw.com',
    }, () => [
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => [
        h('strong', { style: 'color:#18181b' }, props.inviterName),
        ' has invited you to join ',
        h('strong', { style: 'color:#18181b' }, props.organizationName),
        ' on KrabiClaw as ',
        h('strong', { style: 'color:#18181b' }, roleLabel(props.role)),
        '.',
      ]),
    ])
  },
})

function roleLabel(role: string): string {
  if (role === 'admin') return 'an admin'
  if (role === 'editor') return 'an editor'
  return 'a member'
}
