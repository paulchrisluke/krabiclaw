# Prod D1 Reset Runbook

One-time reset: delete `thaiclaw-reviews`, create clean `krabiclaw-db`.
Run these steps **after the branch is merged and deployed**.

## Pre-flight checklist

- [ ] `prod-backup-kikuzuki-2026-05-20.sql` exists locally (run `node scripts/backup-kikuzuki.mjs` again if stale)
- [ ] Branch merged and `yarn deploy` completed successfully
- [ ] You are on `main` with a clean working tree

---

## Step 1 — Create the new D1

```bash
yarn wrangler d1 create krabiclaw-db
```

Copy the `database_id` from the output. You will need it in step 2.

---

## Step 2 — Update wrangler.toml

In `wrangler.toml`, update the `[[d1_databases]]` block:

```toml
[[d1_databases]]
binding = "DB"
database_name = "krabiclaw-db"
database_id = "<paste new database_id here>"
```

Commit this change:

```bash
git add wrangler.toml
git commit -m "chore: rename D1 to krabiclaw-db"
```

---

## Step 3 — Apply schema to new DB

```bash
yarn schema:remote
```

---

## Step 4 — Restore kikuzuki data

```bash
yarn wrangler d1 execute DB --remote --file prod-backup-kikuzuki-2026-05-20.sql
```

Verify counts match the pre-reset matrix:

```bash
yarn wrangler d1 execute DB --remote --command "
SELECT 'user', COUNT(*) FROM user WHERE id = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
UNION ALL SELECT 'sites', COUNT(*) FROM sites
UNION ALL SELECT 'locations', COUNT(*) FROM business_locations
UNION ALL SELECT 'media', COUNT(*) FROM media_assets
UNION ALL SELECT 'site_content', COUNT(*) FROM site_content
UNION ALL SELECT 'menu_items', COUNT(*) FROM menu_items;"
```

Expected: 1 / 1 / 1 / 87 / 44 / 75

---

## Step 5 — Deploy with new database_id

```bash
yarn deploy
```

---

## Step 6 — Smoke test prod

- [ ] `https://kikuzuki-krabi-thailand.krabiclaw.com` loads
- [ ] `bamboo.chow@gmail.com` can log in via Google OAuth
- [ ] Dashboard shows Kikuzuki site and location
- [ ] Menu items visible

---

## Step 7 — Delete old DB

Only after smoke test passes:

```bash
yarn wrangler d1 delete thaiclaw-reviews
```

---

## Rollback

If anything goes wrong before step 7, the old DB is still live.
Point `wrangler.toml` back to `database_id = "57cc9c44-1a23-41c3-8ec9-6b404c12ca2c"` and redeploy.
