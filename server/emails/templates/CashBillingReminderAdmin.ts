import { defineComponent, h } from 'vue'
import { ESection, EText } from 'vue-email'
import EmailShell from '../layouts/EmailShell'

export default defineComponent({
  props: {
    siteName: { type: String, required: true },
    clientEmail: { type: String, required: true },
    adminUrl: { type: String, required: true },
    localRate: { type: Number, required: true },
    localCurrency: { type: String, required: true },
    periodEnd: { type: String, required: true },
    daysUntilDue: { type: Number, required: true },
  },
  setup(props) {
    return () => {
      const amount = `${props.localCurrency} ${props.localRate.toLocaleString()}`
      const urgency = props.daysUntilDue <= 0 ? 'due today' : `due in ${props.daysUntilDue} day${props.daysUntilDue === 1 ? '' : 's'}`
      const preheader = `Collect ${amount} from ${props.clientEmail} — ${urgency}.`

      return h(EmailShell, {
        preheader,
        ctaUrl: props.adminUrl,
        ctaText: 'Open admin dashboard',
        footerNote: 'Mark paid in the admin billing panel once collected.',
      }, () => [
        h(EText, {
          style: 'margin:0 0 16px;font-size:26px;font-weight:800;color:#18181b;letter-spacing:-0.5px;line-height:1.15',
        }, () => `Cash collection: ${props.siteName}`),
        h(EText, {
          style: 'margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6',
        }, () => `Monthly cash payment is ${urgency}. Collect from client and mark paid in the admin panel.`),
        h(ESection, {
          style: 'background:#f9fafb;border-radius:10px;padding:20px 24px;margin-bottom:24px',
        }, () => [
          h(EText, { style: 'margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase' }, () => 'Client'),
          h(EText, { style: 'margin:0 0 12px;font-size:15px;font-weight:600;color:#18181b' }, () => props.clientEmail),
          h(EText, { style: 'margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase' }, () => 'Amount'),
          h(EText, { style: 'margin:0 0 12px;font-size:24px;font-weight:800;color:#18181b' }, () => amount),
          h(EText, { style: 'margin:0 0 4px;font-size:13px;color:#a1a1aa;font-weight:600;letter-spacing:0.5px;text-transform:uppercase' }, () => 'Due date'),
          h(EText, { style: 'margin:0;font-size:15px;font-weight:600;color:#18181b' }, () => props.periodEnd),
        ]),
      ])
    }
  },
})
