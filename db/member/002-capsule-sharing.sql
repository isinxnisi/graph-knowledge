-- Freeze only explicitly shared content revisions. KG bodies stay in Neo4j.
CREATE TABLE member_capsule_revision (
  capsule_id uuid NOT NULL REFERENCES member_capsule(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  PRIMARY KEY (capsule_id, revision)
);
-- One live capability per Capsule. Reissuing removes the previous capability.
CREATE TABLE member_capsule_share (
  id uuid PRIMARY KEY,
  capsule_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (capsule_id, revision) REFERENCES member_capsule_revision(capsule_id, revision) ON DELETE CASCADE
);
