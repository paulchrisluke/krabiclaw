export interface OnboardingChecklistResponse {
  success: boolean
  vertical: string
  brandName: string | null
  city: string | null
  items: {
    business_info: boolean
    hero_image: boolean
    menu_or_experiences: boolean
    story: boolean
    post: boolean
  }
}

export interface OnboardingChecklistItem {
  key: keyof OnboardingChecklistResponse['items']
  label: string
  prompt: string
  complete: boolean
}

export function buildOnboardingChecklistItems(
  checklist: OnboardingChecklistResponse | null | undefined
): OnboardingChecklistItem[] {
  const name = checklist?.brandName ?? 'your business'
  const city = checklist?.city ? ` in ${checklist.city}` : ''
  const isExperience = checklist?.vertical === 'experience'
  const completed = checklist?.items

  return [
    {
      key: 'business_info',
      label: 'Business info imported from Google Maps',
      prompt: `Show me a summary of my site for ${name}`,
      complete: completed?.business_info ?? false,
    },
    {
      key: 'hero_image',
      label: 'Main homepage photo added',
      prompt: `Generate a main photo for ${name}'s homepage`,
      complete: completed?.hero_image ?? false,
    },
    {
      key: 'menu_or_experiences',
      label: isExperience ? 'Experiences listed' : 'Menu added',
      prompt: isExperience
        ? `Add our signature experience to ${name} — include a description, duration, price per person, and max capacity`
        : `Build a menu for ${name}. Ask me about our sections and dishes.`,
      complete: completed?.menu_or_experiences ?? false,
    },
    {
      key: 'story',
      label: 'About section written',
      prompt: `Write an About section for ${name}${city}. Ask me a few questions first.`,
      complete: completed?.story ?? false,
    },
    {
      key: 'post',
      label: 'First post published',
      prompt: `Write a launch post announcing ${name}'s new website is live`,
      complete: completed?.post ?? false,
    },
  ]
}

export function buildOnboardingStarterPrompt(
  checklist: OnboardingChecklistResponse | null | undefined,
  items: OnboardingChecklistItem[] = buildOnboardingChecklistItems(checklist)
): string {
  const name = checklist?.brandName ?? 'my business'
  const isExperience = checklist?.vertical === 'experience'
  const firstMissing = items.find(item => !item.complete) ?? null

  if (!firstMissing) {
    return isExperience
      ? `Help me review ${name}'s experience site and suggest the next highest-impact improvement. Ask me one question at a time.`
      : `Help me review ${name}'s restaurant site and suggest the next highest-impact improvement. Ask me one question at a time.`
  }

  return `Help me finish ${name}'s ${isExperience ? 'experience' : 'restaurant'} site. Start with "${firstMissing.label}" first. Ask me one question at a time and then help me complete this: ${firstMissing.prompt}`
}

/** Short, evergreen quick-action prompts — used wherever we need a starter chip outside the task checklist (ChowBot empty state, MCP edit card examples). Outcome-based phrasing over internal terms, per the ChatGPT MCP fuzzy-intent guidance. */
export function getQuickActionPrompts(vertical: string | null | undefined): string[] {
  if (vertical === 'experience') {
    return [
      'Make my homepage look more inviting',
      'Help me add my best photos to the site',
      'Tell me what my site still needs',
      'What experiences do we offer?',
      'Help me get more bookings',
    ]
  }

  return [
    'Make my homepage look more inviting',
    'Help me add my best photos to the site',
    'Tell me what my site still needs',
    "What's on our menu?",
    'Help me get more bookings',
  ]
}
