-- Migration 0003: inbox for Email Workers (mail to lab@djmiskey.com).
CREATE TABLE emails (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   TEXT,
  from_addr    TEXT NOT NULL,
  from_name    TEXT,
  to_addr      TEXT NOT NULL,
  subject      TEXT,
  text_preview TEXT,              -- first 2,000 characters of the plain-text body
  attachments  INTEGER NOT NULL DEFAULT 0,
  raw_size     INTEGER NOT NULL,
  forwarded    INTEGER NOT NULL DEFAULT 0,
  replied      INTEGER NOT NULL DEFAULT 0,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_emails_received ON emails (received_at);
