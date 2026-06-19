import { defineComponent, h } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
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
      h(EText, { style: 'margin:0;font-size:15px;color:#52525b;line-height:1.6' }, () => 'They will reply using the contact details you provided.'),
    ])
  },
})
