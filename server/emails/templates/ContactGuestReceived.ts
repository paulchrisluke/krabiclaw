import { defineComponent, h, type PropType } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General',
  press: 'Press',
  partnerships: 'Partnerships',
  catering: 'Catering',
  careers: 'Careers',
}

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    subject: { type: String as PropType<string | null>, default: null },
    message: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `Your message to ${props.siteName} was received`,
      title: 'Your message was sent',
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Thanks, ${props.guestName}. Your message has been sent to ${props.siteName}.`),
      h(EmailDetails, {
        rows: [
          props.subject && ['Subject', SUBJECT_LABELS[props.subject] ?? props.subject],
          ['Message', props.message],
        ].filter(Boolean) as [string, string][]
      }),
      h(EText, { style: 'margin:16px 0 0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'They will reply using the contact details you provided.'),
    ])
  },
})
