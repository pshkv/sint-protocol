-- SINT Persistence: Capability tokens table.

CREATE TABLE IF NOT EXISTS sint_tokens (
  token_id          TEXT PRIMARY KEY,
  issuer            TEXT NOT NULL,
  subject           TEXT NOT NULL,
  resource          TEXT NOT NULL,
  actions           JSONB NOT NULL,
  constraints       JSONB NOT NULL DEFAULT '{}',
  delegation_chain  JSONB NOT NULL,
  issued_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  revocable         BOOLEAN NOT NULL DEFAULT TRUE,
  signature         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_subject ON sint_tokens (subject);
CREATE INDEX IF NOT EXISTS idx_tokens_issuer ON sint_tokens (issuer);
CREATE INDEX IF NOT EXISTS idx_tokens_resource ON sint_tokens (resource);
