-- Migration number: 0011 	 2026-06-14T07:27:24.136Z
-- Cache for idempotent authorization code exchanges.
-- ChatGPT makes two concurrent POST /token requests with the same code;
-- consumeVerificationValue is single-use, so the second request gets "invalid code".
-- This table is a D1-backed mutex: first request claims the code and stores the result,
-- concurrent duplicates wait up to 3s and return the cached response.

CREATE TABLE IF NOT EXISTS token_exchange_cache (
  code TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'pending',
  response_body TEXT NOT NULL DEFAULT '',
  http_status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
