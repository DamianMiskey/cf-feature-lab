-- Migration 0002: tables for the async features (phase 5).

-- One row per Cron Trigger run.
CREATE TABLE cron_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cron           TEXT NOT NULL,      -- the cron expression, or 'manual'
  scheduled_time TEXT NOT NULL,
  ran_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  summary        TEXT NOT NULL       -- JSON describing what the run did
);

-- One row per queue message, so the UI can follow each job.
CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued | done | retrying | dead
  attempts     INTEGER NOT NULL DEFAULT 0,
  result       TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_jobs_created ON jobs (created_at);

-- One row per Workflow instance, with a step-by-step log written by the workflow itself.
CREATE TABLE workflow_runs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  current_step TEXT NOT NULL DEFAULT 'queued',
  log          TEXT NOT NULL DEFAULT '[]',     -- JSON array of { at, step, message }
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
