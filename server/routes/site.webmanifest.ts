import { sendRedirect } from 'h3'

export default defineEventHandler((event) => {
  return sendRedirect(event, '/platform/site.webmanifest', 302)
})
