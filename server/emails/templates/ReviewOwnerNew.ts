import { defineComponent, h, type PropType } from 'vue'
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
    reviewsUrl: { type: String as PropType<string | null>, default: null },
  },
  setup(props) {
    const dashboardUrl = `https://${props.platformDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/dashboard`
    return () => h(EmailShell, {
      preheader: `New ${props.rating}-star review for ${props.siteName}`,
      title: `New review from ${props.authorName}`,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `${props.authorName} left a ${props.rating}-star review on ${props.siteName}.`),
      h(EmailDetails, {
        rows: [
          ['From', props.authorName],
          ['Rating', `${props.rating} / 5`],
        ]
      }),
      props.content
        ? h(EText, { class: 'email-text', style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;white-space:pre-line' }, () => props.content)
        : null,
      h(EmailAction, {
        href: props.reviewsUrl ?? dashboardUrl,
        text: props.reviewsUrl ? 'View review' : 'Open Dashboard',
        variant: 'secondary',
      }),
    ])
  },
})
