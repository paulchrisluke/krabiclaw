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
    specialRequests: { type: String as PropType<string | null>, default: null },
    contactPhone: { type: String as PropType<string | null>, default: null },
    contactEmail: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: 'We received your booking request',
      title: `Your booking request was sent — ${props.experienceTitle}`,
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Thanks, ${props.guestName}. Your booking request has been sent to ${props.siteName}.`),
      h(EmailDetails, {
        rows: [
          ['Experience', props.experienceTitle],
          ['Date', props.date],
          ['Time', props.time],
          ['Party size', String(props.partySize)],
          props.specialRequests && ['Special requests', props.specialRequests],
        ].filter(Boolean) as [string, string][]
      }),
      props.contactPhone || props.contactEmail
        ? h(EText, { class: 'email-text', style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => [
            h('strong', null, `Questions? Contact ${props.siteName}: `),
            props.contactPhone ?? '',
            props.contactPhone && props.contactEmail ? ' · ' : '',
            props.contactEmail ?? '',
          ])
        : h(EText, { class: 'email-text', style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.siteName} will contact you to confirm availability.`),
      h(EText, { class: 'email-footer', style: 'margin:0;font-size:13px;color:#71717a;line-height:1.6' }, () => `The team at ${props.siteName}`),
    ])
  },
})
