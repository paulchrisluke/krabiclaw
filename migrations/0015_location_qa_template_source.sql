-- Hand-written: drizzle-kit doesn't model CHECK constraints (see CLAUDE.md).
-- location_qa.source's CHECK predates the 'template' marker convention used by
-- menu_items.source/posts.source (added in 0013/0014, no CHECK there) and the
-- onboarding draft-commit flow (server/api/dashboard/onboarding/drafts/[draftId]/commit.post.ts),
-- which inserts location_qa rows with source = 'template' for auto-generated
-- draft Q&A the owner hasn't authored. Without this, every onboarding commit
-- with seeded Q&A fails with SQLITE_CONSTRAINT_CHECK.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_location_qa` (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  google_question_id TEXT,
  question TEXT NOT NULL,
  question_author TEXT,
  question_date TEXT,
  answer TEXT,
  answer_author TEXT,
  answer_date TEXT,
  is_owner_answer INTEGER NOT NULL DEFAULT 0,
  upvote_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('gmb','google_maps','manual','llm_generated','manual_override','template')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES business_locations(id) ON DELETE CASCADE
);--> statement-breakpoint
INSERT INTO `__new_location_qa` (id, organization_id, site_id, location_id, google_question_id, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at)
SELECT id, organization_id, site_id, location_id, google_question_id, question, question_author, question_date, answer, answer_author, answer_date, is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at FROM `location_qa`;--> statement-breakpoint
DROP TABLE `location_qa`;--> statement-breakpoint
ALTER TABLE `__new_location_qa` RENAME TO `location_qa`;--> statement-breakpoint
CREATE UNIQUE INDEX idx_location_qa_google_id
  ON location_qa(google_question_id) WHERE google_question_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX idx_location_qa_location
  ON location_qa(location_id, status, sort_order);--> statement-breakpoint
PRAGMA foreign_keys=ON;
