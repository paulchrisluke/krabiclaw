import { defineComponent, h, type PropType } from 'vue'
import { EText } from '../vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailAction from '../components/EmailAction'

/**
 * The guest-facing note when a reservation or booking changes state —
 * confirmed, declined, cancelled. Previously sent as bare text (#969).
 */
export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    heading: { type: String, required: true },
    body: { type: String, required: true },
    actionUrl: { type: String as PropType<string | null>, default: null },
    actionText: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: props.heading,
      title: props.heading,
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line' }, () => props.body),
      props.actionUrl && props.actionText
        ? h(EmailAction, { href: props.actionUrl, text: props.actionText })
        : null,
    ])
  },
})
