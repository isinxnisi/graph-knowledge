-- Additive prototype migration. Auth tables are generated from pinned Better
-- Auth options first. Never applied automatically during an HTTP request.
CREATE UNIQUE INDEX IF NOT EXISTS member_account_identity ON account("providerId", "accountId");
CREATE TABLE IF NOT EXISTS member_capsule (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES "user"(id),
  dataset text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND content->>'dataset' = dataset),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_capsule_owner_dataset ON member_capsule(owner_user_id, dataset);
-- Keep the request receipt when a Capsule is deleted: a delayed retry must not
-- resurrect it. Receipts contain only IDs and a digest, no discarded content.
CREATE TABLE IF NOT EXISTS member_capsule_request (
  owner_user_id uuid NOT NULL REFERENCES "user"(id),
  request_id uuid NOT NULL,
  content_hash text NOT NULL,
  capsule_id uuid NOT NULL,
  PRIMARY KEY (owner_user_id, request_id)
);
