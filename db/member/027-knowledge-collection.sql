-- U6a: finite source capture only. No public-write or AI permission.
CREATE SCHEMA IF NOT EXISTS knowledge_collection;
CREATE TABLE knowledge_collection.jobs(
 id uuid PRIMARY KEY, creator_id text NOT NULL, title text NOT NULL, scope text NOT NULL,
 policy text NOT NULL CHECK(policy='source-capture-v1'), state text NOT NULL DEFAULT 'active' CHECK(state IN('active','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), cancelled_at timestamptz
);
CREATE INDEX knowledge_collection_job_order ON knowledge_collection.jobs(created_at DESC,id DESC);
CREATE TABLE knowledge_collection.items(
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES knowledge_collection.jobs(id), ordinal integer NOT NULL,
 url text NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','leased','captured','failed','cancelled')),
 generation integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 lease_hash text, lease_worker text, lease_until timestamptz, next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL DEFAULT '', document jsonb, body bytea, body_sha256 text, text_sha256 text,
 fetched_at timestamptz, captured_at timestamptz,
 UNIQUE(job_id,ordinal),UNIQUE(job_id,url),CHECK(attempts BETWEEN 0 AND 3)
);
CREATE INDEX knowledge_collection_ready ON knowledge_collection.items(next_attempt,id) WHERE state='queued';
CREATE TABLE knowledge_collection.commands(
 principal text NOT NULL, request_id uuid NOT NULL, action text NOT NULL, payload_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(principal,request_id)
);
CREATE TABLE knowledge_collection.workers(id text PRIMARY KEY,last_seen timestamptz NOT NULL DEFAULT clock_timestamp());
