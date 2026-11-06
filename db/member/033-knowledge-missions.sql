-- Scheduled research plans are operator configuration, not public knowledge.
CREATE SCHEMA knowledge_missions;
CREATE TABLE knowledge_missions.plans(
 id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','paused')),
 content jsonb NOT NULL, next_due timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge_missions.runs(
 id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES knowledge_missions.plans(id),
 plan_revision integer NOT NULL, snapshot jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('leased','waiting','delivering','delivered','empty','failed','cancelled')),
 generation integer NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 1,
 worker_id text NOT NULL, lease_hash text, lease_until timestamptz,
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
 payload jsonb, payload_hash text, receipt_id uuid REFERENCES knowledge_import.packages(id),
 reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((payload IS NULL)=(payload_hash IS NULL))
);
CREATE UNIQUE INDEX knowledge_missions_one_live_run ON knowledge_missions.runs(plan_id) WHERE state IN('leased','waiting','delivering');
CREATE INDEX knowledge_missions_due ON knowledge_missions.plans(next_due,id) WHERE state='active';
CREATE TABLE knowledge_missions.commands(
 principal text NOT NULL,request_id uuid NOT NULL,action text NOT NULL,
 payload_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(principal,request_id)
);
CREATE TABLE knowledge_missions.workers(id text PRIMARY KEY,last_seen timestamptz NOT NULL DEFAULT clock_timestamp());
