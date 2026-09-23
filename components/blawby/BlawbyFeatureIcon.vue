<template>
  <UIcon v-if="icon" :name="icon" />
</template>

<script setup lang="ts">
/**
 * The icon a feature, a practice area or a donation tier names.
 *
 * The names in the content are Heroicons component names, because that is what
 * the firm's pages were written against before they moved here. lucide is this
 * app's sole icon pack (see nuxt.config.ts), so this translates those names
 * rather than shipping a second set of glyphs: the file used to carry a record
 * of inlined Heroicons SVG path data, which was a second icon system smuggled
 * in as data, and every name it did not happen to list rendered nothing.
 *
 * A name with no translation renders nothing, which is what an unknown icon did
 * before.
 */
const props = defineProps<{ name?: string | null }>()

const LUCIDE_BY_HEROICON: Record<string, string> = {
  AcademicCapIcon: 'graduation-cap',
  AdjustmentsHorizontalIcon: 'sliders-horizontal',
  BriefcaseIcon: 'briefcase',
  BuildingOffice2Icon: 'building-2',
  BuildingOfficeIcon: 'building',
  CalendarIcon: 'calendar',
  ChatBubbleBottomCenterTextIcon: 'message-square-text',
  ChatBubbleLeftRightIcon: 'messages-square',
  CheckIcon: 'check',
  ClipboardDocumentCheckIcon: 'clipboard-check',
  ClipboardDocumentListIcon: 'clipboard-list',
  ClipboardIcon: 'clipboard',
  CurrencyDollarIcon: 'circle-dollar-sign',
  DocumentCheckIcon: 'file-check',
  DocumentTextIcon: 'file-text',
  ExclamationCircleIcon: 'circle-alert',
  ExclamationTriangleIcon: 'triangle-alert',
  HandshakeIcon: 'handshake',
  HeartIcon: 'heart',
  LockClosedIcon: 'lock',
  PowerIcon: 'power',
  ScaleIcon: 'scale',
  ShieldCheckIcon: 'shield-check',
  ShieldExclamationIcon: 'shield-alert',
  StarIcon: 'star',
  UserGroupIcon: 'users',
  UserIcon: 'user',
  UsersIcon: 'users-round',
  WrenchIcon: 'wrench',
  XCircleIcon: 'circle-x',
}

const icon = computed(() => {
  const lucide = props.name ? LUCIDE_BY_HEROICON[props.name] : undefined
  return lucide ? `i-lucide-${lucide}` : null
})
</script>
