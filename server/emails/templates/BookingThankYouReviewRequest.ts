import { defineComponent, h, type PropType } from 'vue'
import { EText, ELink } from 'vue-email'
import EmailShell from '../layouts/EmailShell'
import EmailDetails from '../components/EmailDetails'
import EmailAction from '../components/EmailAction'

export default defineComponent({
  props: {
    guestName: { type: String, required: true },
    siteName: { type: String, required: true },
    locationName: { type: String as PropType<string | null>, default: null },
    bookingLabel: { type: String, required: true },
    reviewUrl: { type: String, required: true },
    optOutUrl: { type: String, required: true },
    platformDomain: { type: String, required: true },
  },
  setup(props) {
    return () => h(EmailShell, {
      preheader: `Share your experience with ${props.siteName}`,
      title: `How was ${props.bookingLabel}?`,
      siteName: props.siteName,
      platformDomain: props.platformDomain,
    }, () => [
      h(EText, { class: 'email-text', style: 'margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.6' }, () => `Thanks for visiting, ${props.guestName}. ${props.siteName} would love to hear how everything went.`),
      h(EmailDetails, {
        rows: [
          ['Business', props.siteName],
          props.locationName ? ['Location', props.locationName] : null,
          ['Booking', props.bookingLabel],
        ].filter(Boolean) as [string, string][],
      }),
      h(EmailAction, {
        href: props.reviewUrl,
        text: 'Leave a review',
        variant: 'primary',
      }),
      h(EText, { class: 'email-footer', style: 'margin:20px 0 0;font-size:12px;color:#71717a;line-height:1.6' }, () => [
        'Do not want review request emails from this business? ',
        h(ELink, { href: props.optOutUrl, style: 'color:#8F1D21' }, () => 'Opt out here'),
        '.',
      ]),
    ])
  },
})
