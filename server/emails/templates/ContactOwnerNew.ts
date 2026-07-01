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
    email: { type: String, required: true },
    subject: { type: String as PropType<string | null>, default: null },
    message: { type: String, required: true },
    siteName: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New contact message for ${props.siteName}`,
      title: `New website message from ${props.guestName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `New website message from ${props.guestName}.`),
      h(EmailDetails, {
        rows: [
          ['From', props.guestName],
          ['Email', props.email],
          props.subject && ['Subject', SUBJECT_LABELS[props.subject] ?? props.subject],
        ].filter(Boolean) as [string, string][]
      }),
      h(EText, { class: 'email-title', style: 'margin:0 0 8px;font-size:15px;color:#18181b;font-weight:600' }, () => 'Message:'),
      h(EText, { class: 'email-text', style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line' }, () => props.message),
      h(EText, { class: 'email-text', style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'Reply to the customer directly.'),
    ])
  },
})
