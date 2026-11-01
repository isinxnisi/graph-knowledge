CREATE SCHEMA IF NOT EXISTS knowledge75;
CREATE TABLE IF NOT EXISTS knowledge75.migrations (
  name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge75.objects (
  kind text NOT NULL CHECK(kind IN ('entity','source','record','theme','mapping')),
  id text NOT NULL, current_revision integer NOT NULL CHECK(current_revision > 0),
  status_revision integer NOT NULL DEFAULT 1 CHECK(status_revision > 0),
  visibility text NOT NULL CHECK(visibility IN ('private','public','hidden')),
  confirmation text NOT NULL DEFAULT 'unreviewed' CHECK(confirmation IN ('unreviewed','checked','disputed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,id)
);
CREATE TABLE knowledge75.revisions (
  kind text NOT NULL, id text NOT NULL, revision integer NOT NULL CHECK(revision > 0),
  content jsonb NOT NULL, reason text NOT NULL, actor_id text NOT NULL, actor_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id,revision),
  FOREIGN KEY(kind,id) REFERENCES knowledge75.objects(kind,id)
);
CREATE TABLE knowledge75.operations (
  actor_id text NOT NULL, request_id uuid NOT NULL, actor_kind text NOT NULL, digest text NOT NULL,
  input jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE knowledge75.changes (
  sequence bigserial PRIMARY KEY, kind text NOT NULL, id text NOT NULL,
  content_revision integer NOT NULL, status_revision integer NOT NULL,
  operation text NOT NULL, actor_id text NOT NULL, request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(kind,id) REFERENCES knowledge75.objects(kind,id)
);
CREATE TABLE knowledge75.concepts (
  id text NOT NULL, revision integer NOT NULL, body jsonb NOT NULL, PRIMARY KEY(id,revision)
);
CREATE TABLE knowledge75.legacy_links (
  dataset text NOT NULL, legacy_claim_id text NOT NULL, record_id text NOT NULL,
  imported_revision integer NOT NULL, payload jsonb NOT NULL, sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(dataset,legacy_claim_id)
);
CREATE INDEX knowledge75_revision_created ON knowledge75.revisions(created_at);
CREATE INDEX knowledge75_visibility ON knowledge75.objects(kind,visibility,id);

-- Current visibility is an access gate; only explicitly published content revisions
-- may be read without operator privileges. A private older draft stays private.
CREATE TABLE IF NOT EXISTS knowledge75.published_revisions (
  kind text NOT NULL, id text NOT NULL, revision integer NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(kind,id,revision),
  FOREIGN KEY(kind,id,revision) REFERENCES knowledge75.revisions(kind,id,revision)
);
