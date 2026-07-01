import { defineComponent, h, type PropType } from 'vue'
import { ESection, EText } from 'vue-email'

// Nuxt UI-inspired color tokens (email-safe inline styles)
const INFO_BG = '#eff6ff' // blue-50
const INFO_FG = '#1e40af' // blue-800
const INFO_BORDER = '#bfdbfe' // blue-200

const SUCCESS_BG = '#f0fdf4' // green-50
const SUCCESS_FG = '#166534' // green-800
const SUCCESS_BORDER = '#bbf7d0' // green-200

const WARNING_BG = '#fefce8' // yellow-50
const WARNING_FG = '#854d0e' // yellow-800
const WARNING_BORDER = '#fef08a' // yellow-200

const ERROR_BG = '#fef2f2' // red-50
const ERROR_FG = '#991b1b' // red-800
const ERROR_BORDER = '#fecaca' // red-200

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

    return () => h(ESection, { 
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
