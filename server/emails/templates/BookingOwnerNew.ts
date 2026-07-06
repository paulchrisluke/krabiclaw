import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    experienceTitle: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    partySize: { type: Number, required: true },
    email: { type: String, required: true },
    phone: { type: String as PropType<string | null>, default: null },
    specialRequests: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
    replyUrl: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New experience booking for ${props.siteName}`,
      title: `New booking request from ${props.guestName}`,
      platformDomain: props.platformDomain,
      ctaUrl: props.replyUrl ?? undefined,
      ctaText: props.replyUrl ? 'Reply in dashboard' : undefined,
    }, () => [
      h(EText, { class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `New experience booking request from ${props.guestName}.`),
      h(EmailDetails, {
        rows: [
          ['Business', props.siteName],
          ['Experience', props.experienceTitle],
          ['Customer', props.guestName],
          ['Date', props.date],
          ['Time', props.time],
          ['Party size', String(props.partySize)],
          ['Email', props.email],
          props.phone && ['Phone', props.phone],
          props.specialRequests && ['Special requests', props.specialRequests],
        ].filter(Boolean) as [string, string][]
      }),
      h(EText, { class: 'email-text', style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Contact the customer to confirm the booking.'),
    ])
  },
})
