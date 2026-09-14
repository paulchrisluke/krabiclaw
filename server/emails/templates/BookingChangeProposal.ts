import { defineComponent, h, type PropType } from 'vue'
import { EText } from '../vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'
import EmailAction from '../components/EmailAction'

/**
 * A proposed change to a guest's booking or reservation, with the before and
 * after side by side so the guest can see exactly what they are accepting.
 * Previously sent as bare text (#969).
 */
export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    heading: { type: String, required: true },
    intro: { type: String, required: true },
    rows: { type: Array as PropType<Array<[string, string]>>, default: () => [] },
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
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line' }, () => props.intro),
      props.rows.length ? h(EmailDetails, { rows: props.rows }) : null,
      props.actionUrl && props.actionText
        ? h(EmailAction, { href: props.actionUrl, text: props.actionText })
        : null,
    ])
  },
})
