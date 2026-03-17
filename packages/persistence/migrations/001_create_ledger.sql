-- SINT Persistence: Ledger events table.
-- Append-only — no UPDATE or DELETE operations permitted.

CREATE TABLE IF NOT EXISTS sint_ledger_events (
  event_id          TEXT PRIMARY KEY,
  sequence_number   BIGINT NOT NULL UNIQUE,
  timestamp         TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  token_id          TEXT,
  payload           JSONB NOT NULL DEFAULT '{}',
  previous_hash     TEXT NOT NULL,
  hash              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_agent_id ON sint_ledger_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_event_type ON sint_ledger_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_sequence ON sint_ledger_events (sequence_number);
CREATE INDEX IF NOT EXISTS idx_ledger_timestamp ON sint_ledger_events (timestamp);
