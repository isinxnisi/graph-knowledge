-- Extend the usage-only ledger; never rewrite migration 021 or its old rows.
ALTER TABLE member_knowledge.review_attempts DROP CONSTRAINT review_attempts_purpose_check;
ALTER TABLE member_knowledge.review_attempts ADD CONSTRAINT review_attempts_purpose_check CHECK(purpose IN('submission','evaluation','collection-read','collection-check','collection-evaluation'));
CREATE TABLE knowledge_collection.read_jobs(
 id uuid PRIMARY KEY, capture_job_id uuid NOT NULL REFERENCES knowledge_collection.jobs(id), creator_id text NOT NULL,
 scope text NOT NULL, target jsonb NOT NULL, context jsonb NOT NULL, source_ids uuid[] NOT NULL,
 policy text NOT NULL CHECK(policy='collection-reading-v1'), state text NOT NULL DEFAULT 'active' CHECK(state IN('active','cancelled')),
 evaluation boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge_collection.read_tasks(
 id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES knowledge_collection.read_jobs(id), source_id uuid NOT NULL REFERENCES knowledge_collection.items(id),
 purpose text NOT NULL CHECK(purpose IN('read','check')), content jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','retry','quota','ready','done','attention','cancelled')),
 reason text NOT NULL DEFAULT '', attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(), lease_token uuid, lease_until timestamptz,
 current_attempt uuid REFERENCES member_knowledge.review_attempts(id), result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX collection_read_due ON knowledge_collection.read_tasks(next_attempt,created_at) WHERE state IN('queued','retry','quota');
CREATE TABLE knowledge_collection.read_attempts(
 id uuid PRIMARY KEY REFERENCES member_knowledge.review_attempts(id), task_id uuid NOT NULL REFERENCES knowledge_collection.read_tasks(id),
 wire text NOT NULL, wire_digest text NOT NULL, result jsonb
);
CREATE TABLE knowledge_collection.read_decisions(
 id uuid PRIMARY KEY, task_id uuid NOT NULL UNIQUE REFERENCES knowledge_collection.read_tasks(id), job_id uuid NOT NULL REFERENCES knowledge_collection.read_jobs(id),
 command jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','applied','blocked')),reason text NOT NULL DEFAULT '',result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE knowledge_collection.read_workers(id text PRIMARY KEY,last_seen timestamptz NOT NULL DEFAULT clock_timestamp());
