import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

const CARD = 'border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin:0 0 20px'
const ROW = 'font-size:15px;color:#18181b'
const ROW_TOP = `${ROW};margin:8px 0 0`
const ROW_TIGHT = `${ROW};margin:4px 0 0`

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    guests: { type: String, required: true },
    contactPhone: { type: String as PropType<string | null>, default: null },
    contactEmail: { type: String as PropType<string | null>, default: null },
    cancelUrl: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `Your reservation request was sent to ${props.siteName}`,
      title: 'Your reservation request was sent',
      siteName: props.siteName,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Hi ${props.guestName}, your reservation request has been sent to ${props.siteName}.`),
      h(ESection, { style: CARD }, () => [
        h(EText, { style: ROW }, () => [h('strong', null, 'Venue: '), props.siteName]),
        h(EText, { style: ROW_TOP }, () => [h('strong', null, 'Date: '), props.date]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Time: '), props.time]),
        h(EText, { style: ROW_TIGHT }, () => [h('strong', null, 'Party size: '), props.guests]),
      ]),
      props.contactPhone || props.contactEmail
        ? h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => [
            h('strong', null, `Questions? Contact ${props.siteName}: `),
            props.contactPhone ? `${props.contactPhone} ` : null,
            props.contactEmail ? props.contactEmail : null,
          ])
        : null,
      props.cancelUrl
        ? h(EText, { style: 'margin:0;font-size:12px;color:#71717a;line-height:1.6' }, () => [
            'Need to cancel? ',
            h(ELink, { href: props.cancelUrl!, style: 'color:#8F1D21' }, () => 'Cancel your reservation here'),
            ' (link valid for 30 days).',
          ])
        : null,
    ])
  },
})
