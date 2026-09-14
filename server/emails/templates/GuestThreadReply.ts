import { defineComponent, h } from 'vue'
import { EText } from '../vue-email'
import EmailShell from '../layouts/EmailShell'

/**
 * A member's typed reply to a guest.
 *
 * The body is the person's own words, so it leads and nothing is added around
 * it beyond the shell — this used to be sent as bare text with no styling at
 * all (#969).
 */
export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    body: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `A reply from ${props.siteName}`,
      title: `Reply from ${props.siteName}`,
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line' }, () => props.body),
      h(EText, { style: 'margin:24px 0 0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Reply to this email and your message goes straight back to the same conversation.'),
    ])
  },
})
