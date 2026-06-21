export function validatePassword(password: string): string {
  if (!password) return 'Password is required.'

  const unmet: string[] = []
  if (password.length < 8) unmet.push('be at least 8 characters')
  if (password.length > 128) unmet.push('be at most 128 characters')
  if (!/[a-z]/.test(password)) unmet.push('include a lowercase letter')
  if (!/[A-Z]/.test(password)) unmet.push('include an uppercase letter')
  if (!/\d/.test(password)) unmet.push('include a number')
  if (!/[^A-Za-z0-9]/.test(password)) unmet.push('include a special character')

  return unmet.length ? `Password must ${unmet.join(', ')}.` : ''
}
