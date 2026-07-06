import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    guests: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    locationName: { type: String as PropType<string | null>, default: null },
    specialRequests: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
    replyUrl: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New reservation request for ${props.siteName}`,
      title: `New reservation request from ${props.guestName}`,
      platformDomain: props.platformDomain,
      ctaUrl: props.replyUrl ?? undefined,
      ctaText: props.replyUrl ? 'Reply in dashboard' : undefined,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => 'New reservation request from your website.'),
      h(EmailDetails, {
        rows: [
          ['Customer', props.guestName],
          props.locationName && ['Location', props.locationName],
          ['Date', props.date],
          ['Time', props.time],
          ['Party size', props.guests],
          ['Phone', props.phone],
          ['Email', props.email],
          props.specialRequests && ['Special requests', props.specialRequests],
        ].filter(Boolean) as [string, string][]
      }),
      h(EText, { style: 'margin:24px 0 0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Reply or contact the customer to confirm the reservation.'),
    ])
  },
})
