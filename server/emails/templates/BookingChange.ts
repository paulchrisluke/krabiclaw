import { defineComponent, h, type PropType } from 'vue'
import { EText } from '../vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    title: { type: String, required: true },
    body: { type: String, required: true },
    siteName: { type: String, required: true },
    unsubscribeUrl: { type: String as PropType<string | null>, default: null },
    platformDomain: { type: String, required: true },
    actionUrl: { type: String },
    actionLabel: { type: String },
  },
  setup(props) {
    return () => h(EmailShell, {
      title: props.title, preheader: props.title, siteName: props.siteName,
      unsubscribeUrl: props.unsubscribeUrl,
      platformDomain: props.platformDomain, ctaUrl: props.actionUrl, ctaText: props.actionLabel,
    }, () => props.body.split('\n\n').map(paragraph => h(EText, {
      class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line',
    }, () => paragraph)))
  },
})
