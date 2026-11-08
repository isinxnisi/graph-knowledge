-- Operator-authenticated ChatGPT theme registration. No public Theme-posting UI.
CREATE TABLE knowledge_missions.theme_registrations (
 request_id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),
 input jsonb NOT NULL,
 state text NOT NULL DEFAULT 'saved'
   CHECK(state IN('saved','processing','published','published-with-issues','needs-changes','cancelled')),
 receipt_id uuid REFERENCES knowledge_import.packages(id),
 theme_id text NOT NULL UNIQUE,
 result jsonb,
 reason text NOT NULL DEFAULT '',
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_registration_pending ON knowledge_missions.theme_registrations(next_attempt,created_at)
 WHERE state IN('saved','processing');
CREATE INDEX theme_registration_owner ON knowledge_missions.theme_registrations(owner_id,created_at DESC);
