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
import { PARITY_CASES } from '~/server/notifications/parity-cases'

const failures: string[] = []

for (const { template, message } of PARITY_CASES) {
  const mapping = WHATSAPP_MAPPINGS[template as WhatsAppTemplate]
  if (!mapping) {
    failures.push(`${template}: no WhatsApp mapping declared`)
    continue
  }

  const { vars, omitted } = toWhatsAppVars(message, template as WhatsAppTemplate)

  for (const key of omitted) {
    const fact = message.facts.find(entry => entry.key === key)!
    if (fact.lead) {
      failures.push(`${template}: lead fact "${key}" (${fact.label}) reaches the email but not WhatsApp`)
    } else if (!mapping.cannotCarry?.[key]) {
      failures.push(`${template}: fact "${key}" is unmapped and undeclared — map it or record why the template cannot carry it in cannotCarry`)
    }
  }

  // A declared shortfall that no longer exists is stale documentation.
  for (const key of Object.keys(mapping.cannotCarry ?? {})) {
    if (!message.facts.some(entry => entry.key === key)) {
      failures.push(`${template}: cannotCarry names "${key}", which this message no longer has`)
    }
  }

  // The slots must actually fill: an empty one renders the template's own
  // placeholder text, which is how "Date" and "Time" shipped to guests.
  const payload = buildWhatsAppTemplatePayload(template as WhatsAppTemplate, vars)
  for (const component of payload.components) {
    component.parameters.forEach((parameter, index) => {
      if (!parameter.text.trim()) failures.push(`${template}: ${component.type} slot ${index + 1} renders empty`)
    })
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Notification parity passed: ${PARITY_CASES.length} events, every lead fact reaches both channels`)
