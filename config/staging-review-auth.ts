export const STAGING_REVIEW_AUTH = {
  id: 'user-staging-review',
  name: 'Staging Review',
  email: 'staging-review@staging.krabiclaw.test',
  organizationIds: ['org-pottery-house', 'org-kikuzuki', 'org-ncls-blawby'],
  siteIds: ['site-pottery-house', 'site-kikuzuki', 'site-ncls-blawby'],
} as const

export function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function buildStagingReviewAuthSql(passwordHash: string, rotatePassword = false) {
  const userId = sqlString(STAGING_REVIEW_AUTH.id)
  const email = sqlString(STAGING_REVIEW_AUTH.email)

  const organizations = STAGING_REVIEW_AUTH.organizationIds.map((organizationId) => `
INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlString(`member-${STAGING_REVIEW_AUTH.id}-${organizationId}`)}, ${sqlString(organizationId)}, ${userId}, 'editor', unixepoch())
ON CONFLICT(id) DO UPDATE SET organizationId = excluded.organizationId, userId = excluded.userId, role = excluded.role;
`).join('')

  const teams = STAGING_REVIEW_AUTH.siteIds.map((siteId) => `
INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
SELECT 'site:' || id, COALESCE(brand_name, id), organization_id, unixepoch()
FROM sites WHERE id = ${sqlString(siteId)};
UPDATE sites SET team_id = COALESCE(team_id, 'site:' || id) WHERE id = ${sqlString(siteId)};
INSERT INTO teamMember (id, teamId, userId, membershipKey, createdAt)
SELECT ${sqlString(`team-member-${STAGING_REVIEW_AUTH.id}-${siteId}`)}, team_id, ${userId}, team_id || ':' || ${userId}, unixepoch()
FROM sites WHERE id = ${sqlString(siteId)} AND team_id IS NOT NULL
ON CONFLICT(id) DO UPDATE SET teamId = excluded.teamId, userId = excluded.userId, membershipKey = excluded.membershipKey;
`).join('')

  const credential = rotatePassword
    ? `
DELETE FROM account WHERE userId = ${userId} AND providerId = 'credential';
INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES (${sqlString(`account-${STAGING_REVIEW_AUTH.id}-credential`)}, ${userId}, 'credential', ${userId}, ${sqlString(passwordHash)}, unixepoch(), unixepoch());`
    : `
INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES (${sqlString(`account-${STAGING_REVIEW_AUTH.id}-credential`)}, ${userId}, 'credential', ${userId}, ${sqlString(passwordHash)}, unixepoch(), unixepoch());`

  return `PRAGMA foreign_keys = ON;
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${userId}, ${sqlString(STAGING_REVIEW_AUTH.name)}, ${email}, 1, 'user', unixepoch(), unixepoch())
ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, emailVerified = 1, role = 'user', updatedAt = unixepoch();
${credential}
${organizations}
${teams}`
}
