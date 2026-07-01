import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText } from 'vue-email'

// Light-mode tints of the KrabiClaw brand palette (assets/css/main.css --kc-success/
// --kc-warning/--kc-danger, plus --kc-teal for info — there's no separate brand info
// color). Email clients can't load main.css or read CSS custom properties (most strip
// external stylesheets/@import, and Outlook's Word engine ignores var() entirely), so
// these are the same brand hues hand-copied as literal hex, not a shared token import.
// Dark-mode counterparts live in EmailShell.ts's inline <style> media query, per variant
// (see .email-callout-info/success/warning/error there) — a single generic override
// would flatten all four variants to the same gray, losing the semantic color coding.
const INFO_BG = '#E9FAFA'    // pale kc-teal (#2BB5B5)
const INFO_FG = '#1B7373'
const INFO_BORDER = '#BFEBEB'

const SUCCESS_BG = '#EAF9F1' // pale kc-success (#2BB573)
const SUCCESS_FG = '#1E8A54'
const SUCCESS_BORDER = '#BFE9D2'

const WARNING_BG = '#FFF4E3' // pale kc-warning (#F8A93A)
const WARNING_FG = '#92590A'
const WARNING_BORDER = '#F6D9A6'

const ERROR_BG = '#FCEBEA'   // pale kc-danger (#E0524C)
const ERROR_FG = '#9B332E'
const ERROR_BORDER = '#F3C3C0'

export default defineComponent({
  props: {
    variant: {
      type: String as PropType<'info' | 'success' | 'warning' | 'error'>,
      default: 'info'
    },
    title: { type: String, default: null },
    children: { type: String, required: true },
  },
  setup(props) {
    const getStyles = () => {
      switch (props.variant) {
        case 'success':
          return { bg: SUCCESS_BG, fg: SUCCESS_FG, border: SUCCESS_BORDER }
        case 'warning':
          return { bg: WARNING_BG, fg: WARNING_FG, border: WARNING_BORDER }
        case 'error':
          return { bg: ERROR_BG, fg: ERROR_FG, border: ERROR_BORDER }
        default:
          return { bg: INFO_BG, fg: INFO_FG, border: INFO_BORDER }
      }
    }

    const styles = getStyles()
    const variantClass = `email-callout-${props.variant}`

    return () => h(ESection, {
      class: `email-callout ${variantClass}`,
      style: `
        margin:24px 0 0;
        background:${styles.bg};
        border:1px solid ${styles.border};
        border-radius:8px;
        padding:16px 20px;
      `
    }, () => [
      props.title
        ? h(EText, {
            class: `email-callout-title ${variantClass}-title`,
            style: `
              margin:0 0 8px;
              font-size:14px;
              font-weight:600;
              color:${styles.fg};
              text-transform:uppercase;
              letter-spacing:0.05em;
            `
          }, () => props.title)
        : null,
      h(EText, {
        class: `email-callout-body ${variantClass}-body`,
        style: `
          margin:0;
          font-size:15px;
          color:${styles.fg};
          line-height:1.5;
        `
      }, () => props.children),
    ])
  },
})
