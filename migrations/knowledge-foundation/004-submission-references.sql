-- Explicit provenance for the server-captured public KG identity bridge.
-- The original KG is read-only; no display-name identity matching is allowed.
CREATE TABLE knowledge75.legacy_identity (
 kind text NOT NULL CHECK(kind IN ('entity','record')), id text NOT NULL,
 dataset text NOT NULL, legacy_id text NOT NULL, publication_revision text NOT NULL,
 payload jsonb NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id), UNIQUE(dataset,kind,legacy_id),
 FOREIGN KEY(kind,id) REFERENCES knowledge75.objects(kind,id)
);
