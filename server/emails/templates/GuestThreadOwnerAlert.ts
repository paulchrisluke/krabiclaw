import { defineComponent, h, type PropType } from 'vue'
import { EText, ESection } from '../vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailAction from '../components/EmailAction'

const PRIMARY = '#FB7461'
const QUOTE_BG = '#fff7f4'
const QUOTE_FG = '#374151'
const FG_MUTED = '#52525b'

/**
 * Tells a member a guest has replied, and quotes enough of the message to
 * decide whether to open the thread.
 *
 * This replaced a hand-rolled HTML string in server/utils/notifications.ts that
 * carried no logo, card or footer (#969). Escaping is no longer done by hand
 * either — vue-email escapes the interpolated text.
 */
export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    inboundChannel: { type: String as PropType<'email' | 'whatsapp'>, required: true },
    messagePreview: { type: String, required: true },
    replyUrl: { type: String as PropType<string | null>, default: null },
    siteName: { type: String as PropType<string | null>, default: null },
    unsubscribeUrl: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `${props.guestName} replied`,
      title: 'New guest reply',
      siteName: props.siteName,
      unsubscribeUrl: props.unsubscribeUrl,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: `margin:0 0 16px;font-size:15px;color:${FG_MUTED};line-height:1.6` }, () =>
        `${props.guestName} sent a new reply by ${props.inboundChannel === 'whatsapp' ? 'WhatsApp' : 'email'}.`),
      h(ESection, {
        class: 'email-quote',
        style: `margin:0;padding:12px 16px;border-left:4px solid ${PRIMARY};background:${QUOTE_BG}`,
      }, () => [
        h(EText, { class: 'email-quote-text', style: `margin:0;font-size:15px;color:${QUOTE_FG};line-height:1.6;white-space:pre-line` }, () => props.messagePreview),
      ]),
      props.replyUrl ? h(EmailAction, { href: props.replyUrl, text: 'Open thread in dashboard' }) : null,
    ])
  },
})
