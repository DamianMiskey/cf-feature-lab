-- Migration 0001: notes table for the D1 demo (and Vectorize search in phase 4).
-- Apply with: npx wrangler d1 migrations apply DB --local   (or --remote)
CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  tag        TEXT    NOT NULL DEFAULT 'general',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_tag ON notes (tag);

INSERT INTO notes (author, body, tag) VALUES
  ('Ada',   'Workers start in under 5ms because they run in V8 isolates, not containers.', 'workers'),
  ('Linus', 'D1 is SQLite under the hood, so standard SQL just works.', 'd1'),
  ('Grace', 'R2 has zero egress fees: you only pay for storage and operations.', 'r2'),
  ('Alan',  'KV writes can take up to 60 seconds to be visible in every region.', 'kv');
