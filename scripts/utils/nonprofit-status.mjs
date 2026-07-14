/**
 * Node-side companion to utils/professional-service-schema.ts's
 * normalizeNonprofitStatus(). Scripts under scripts/ run as plain Node ESM
 * (no TS path aliases), so this is intentionally a small, dependency-free
 * duplicate of the same mapping rather than a cross-runtime import — keep the
 * two in sync if the canonical enum list changes.
 */

const NONPROFIT_501C_MAX = 29;
const NONPROFIT_STATUS_CANONICAL = new Set([
  ...Array.from({ length: NONPROFIT_501C_MAX }, (_, index) => `https://schema.org/Nonprofit501c${index + 1}`),
  "https://schema.org/NonprofitANBI",
  "https://schema.org/NonprofitSBBI",
]);

/**
 * @param {string | null | undefined} raw
 * @returns {{ value: string | null, valid: boolean }}
 */
export function normalizeNonprofitStatus(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) return { value: null, valid: true };

  if (/^https:\/\/schema\.org\//i.test(trimmed)) {
    return { value: trimmed, valid: NONPROFIT_STATUS_CANONICAL.has(trimmed) };
  }

  const match = trimmed.match(/501\s*\(?\s*c\s*\)?\s*\(?\s*(\d{1,2})\s*\)?/i);
  if (match) {
    const canonical = `https://schema.org/Nonprofit501c${Number(match[1])}`;
    return { value: canonical, valid: NONPROFIT_STATUS_CANONICAL.has(canonical) };
  }

  return { value: trimmed, valid: false };
}

export { NONPROFIT_STATUS_CANONICAL };
