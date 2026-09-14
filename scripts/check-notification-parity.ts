#!/usr/bin/env node
// Every fact the email leads with must reach WhatsApp.
//
// Each event used to be written twice — once as email props, once as WhatsApp
// vars — and the two drifted without anyone noticing: a cancelled reservation
// told WhatsApp neither the guest's email nor whether it had been confirmed,
// and a new review never named its author. This is what stops that happening
// again: a `lead` fact with nowhere to go is a build failure, and a non-lead
// fact a template genuinely cannot carry has to be declared in `cannotCarry`
// with a reason.

import { WHATSAPP_MAPPINGS, toWhatsAppVars } from '~/server/notifications/whatsapp-mapping'
import { buildWhatsAppTemplatePayload, type WhatsAppTemplate } from '~/server/utils/whatsapp'
import { NOTIFICATION_CATALOG } from '~/server/notifications/catalog'
import type { NotificationMessage } from '~/server/notifications/messages'

/**
 * Words a slot must never render. Each is the name of the thing the slot is
 * for, which is what a guest saw when a template fell back to its own
 * placeholder instead of the real value.
 */
const FIELD_NAME_PLACEHOLDERS = new Set(['date', 'time', 'location', 'guest', 'email', 'phone', 'status', 'subject', 'rating'])

const failures: string[] = []

const dualChannel = NOTIFICATION_CATALOG.filter(entry => entry.whatsappTemplate)

for (const entry of dualChannel) {
  const template = entry.whatsappTemplate!
  const message = entry.message
  const mapping = WHATSAPP_MAPPINGS[template as WhatsAppTemplate]
  if (!mapping) {
    failures.push(`${template}: no WhatsApp mapping declared`)
    continue
  }

  const { omitted } = toWhatsAppVars(message, template as WhatsAppTemplate)

  for (const key of omitted) {
    const fact = message.facts.find(entry => entry.key === key)!
    if (fact.lead) {
      failures.push(`${template}: lead fact "${key}" (${fact.label}) reaches the email but not WhatsApp`)
    } else if (!mapping.cannotCarry?.[key]) {
      failures.push(`${template}: fact "${key}" is unmapped and undeclared — map it or record why the template cannot carry it in cannotCarry`)
    }
  }

  // A declared shortfall that no longer exists is stale documentation, and one
  // that is now mapped is worse: it leaves an exemption standing that would
  // hide the fact going missing again later.
  for (const key of Object.keys(mapping.cannotCarry ?? {})) {
    if (!message.facts.some(entry => entry.key === key)) {
      failures.push(`${template}: cannotCarry names "${key}", which this message no longer has`)
    } else if (!omitted.includes(key)) {
      failures.push(`${template}: cannotCarry names "${key}", but the template now carries it — drop the exemption`)
    }
  }

  // The slots must actually fill: an empty one renders the template's own
  // placeholder text, which is how "Date" and "Time" shipped to guests.
  //
  // Checked twice — once with the sample as written, and once with every
  // optional fact removed. Real data is full of nulls (a reservation with no
  // phone, a proposal recorded before the time was stored separately), and a
  // happy-path sample hides exactly the case that misfired.
  const stripped: NotificationMessage = { ...message, facts: message.facts.filter(entry => entry.lead) }
  for (const [label, candidate] of [['as sampled', message], ['with optional facts removed', stripped]] as const) {
    const payload = buildWhatsAppTemplatePayload(template as WhatsAppTemplate, toWhatsAppVars(candidate, template as WhatsAppTemplate).vars)
    for (const component of payload.components) {
      component.parameters.forEach((parameter, index) => {
        const text = parameter.text.trim()
        if (!text) {
          failures.push(`${template} (${label}): ${component.type} slot ${index + 1} renders empty`)
        } else if (FIELD_NAME_PLACEHOLDERS.has(text.toLowerCase())) {
          failures.push(`${template} (${label}): ${component.type} slot ${index + 1} renders "${text}" — a field name, not a value`)
        }
      })
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Notification parity passed: ${dualChannel.length} dual-channel events, every lead fact reaches both channels`)
