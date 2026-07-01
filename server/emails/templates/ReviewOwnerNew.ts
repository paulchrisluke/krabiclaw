import { defineComponent, h } from 'vue'
import { EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'
import EmailAction from '../components/EmailAction'

export default defineComponent({
  props: {
    authorName: { type: String, required: true },
    rating: { type: Number, required: true },
    content: { type: String, default: '' },
    siteName: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `New ${props.rating}-star review for ${props.siteName}`,
      title: `New review from ${props.authorName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.authorName} left a ${props.rating}-star review on ${props.siteName}.`),
      h(EmailDetails, {
        rows: [
          ['From', props.authorName],
          ['Rating', `${props.rating} / 5`],
        ]
      }),
      props.content
        ? h(EText, { style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6' }, () => props.content)
        : null,
      h(EmailAction, {
        href: `https://${props.platformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/dashboard`,
        text: 'Open Dashboard',
        variant: 'secondary',
      }),
    ])
  },
})
