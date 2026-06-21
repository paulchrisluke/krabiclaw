export class InvalidFieldError extends Error {}

export const stringArrayOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) throw new InvalidFieldError()
  return value.map(String).map(item => item.trim()).filter(Boolean)
}
