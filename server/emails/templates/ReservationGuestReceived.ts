import { defineComponent, h, type PropType } from 'vue'
import { EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

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
    specialRequests: { type: String as PropType<string | null>, default: null },
    locationName: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `Your reservation request was sent to ${props.siteName}`,
      title: 'Your reservation request was sent',
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Hi ${props.guestName}, your reservation request has been sent to ${props.siteName}.`),
      h(EmailDetails, {
        rows: [
          ['Venue', props.locationName ? `${props.siteName} — ${props.locationName}` : props.siteName],
          ['Date', props.date],
          ['Time', props.time],
          ['Party size', props.guests],
          props.specialRequests && ['Special requests', props.specialRequests],
        ].filter(Boolean) as [string, string][]
      }),
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
