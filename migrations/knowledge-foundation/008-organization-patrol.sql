-- No original, published edition or member data is changed by the patrol.
CREATE TABLE knowledge75.patrol_cycles (
 origin text PRIMARY KEY CHECK(origin IN ('common','public-kg')),
 phase text NOT NULL DEFAULT 'scanning' CHECK(phase IN ('scanning','queueing','idle')),
 inventory_run uuid REFERENCES knowledge75.target_inventory_runs(id),
 completed_run uuid REFERENCES knowledge75.target_inventory_runs(id),
 cursor jsonb, scanned integer NOT NULL DEFAULT 0 CHECK(scanned>=0),
 total integer NOT NULL DEFAULT 0 CHECK(total>=0),
 scan_started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 next_scan_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 policy text NOT NULL, error_code text,
 retry_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge75.patrol_targets (
 origin text NOT NULL REFERENCES knowledge75.patrol_cycles(origin),
 kind text NOT NULL CHECK(kind IN ('entity','record','source','theme','mapping')),
 id text NOT NULL,
 inventory_run uuid NOT NULL REFERENCES knowledge75.target_inventory_runs(id),
 revision text NOT NULL, status_revision text NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 visibility text NOT NULL, eligible boolean NOT NULL,
 present boolean NOT NULL DEFAULT true,
 generation integer NOT NULL CHECK(generation>0),
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(origin,kind,id)
);
-- These are inputs for candidate generation, NOT AI judgements or approvals.
-- R2b will consume them through the budgeted verification/application path.
CREATE TABLE knowledge75.patrol_tasks (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),
 origin text NOT NULL, kind text NOT NULL, target_id text NOT NULL,
 target_generation integer NOT NULL, fingerprint text NOT NULL,
 policy text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','superseded')),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(origin,kind,target_id) REFERENCES knowledge75.patrol_targets(origin,kind,id),
 UNIQUE(origin,kind,target_id,target_generation,policy)
);
CREATE INDEX patrol_pending ON knowledge75.patrol_tasks(created_at,id) WHERE state='pending';
CREATE INDEX patrol_targets_seen ON knowledge75.patrol_targets(origin,inventory_run);
