-- Private, server-acquired source editions. Published knowledge versions stay immutable.
CREATE TABLE knowledge_missions.source_checks (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES knowledge_missions.runs(id),
 plan_id uuid NOT NULL REFERENCES knowledge_missions.plans(id),
 document_url text NOT NULL,
 final_url text NOT NULL,
 body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
 text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[a-f0-9]{64}$'),
 extractor text NOT NULL,
 media_type text NOT NULL,
 body_gzip bytea NOT NULL,
 text_gzip bytea NOT NULL,
 previous_id uuid REFERENCES knowledge_missions.source_checks(id),
 checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(run_id,document_url)
);
CREATE INDEX mission_source_history ON knowledge_missions.source_checks(plan_id,document_url,checked_at DESC);
CREATE TABLE knowledge_missions.web_importers (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 original_namespace text NOT NULL,
 namespace text NOT NULL UNIQUE,
 themes text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,original_namespace)
);
CREATE TABLE knowledge_missions.web_deliveries (
 request_id uuid PRIMARY KEY,
 importer_id uuid NOT NULL REFERENCES knowledge_missions.web_importers(id) ON DELETE CASCADE,
 original_hash text NOT NULL,
 original_payload jsonb NOT NULL,
 payload jsonb NOT NULL,
 receipt_id uuid REFERENCES knowledge_import.packages(id),
 state text NOT NULL DEFAULT 'saved' CHECK(state IN('saved','delivered','cancelled','needs-changes')),
 reason text NOT NULL DEFAULT '',
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mission_web_owner ON knowledge_missions.web_importers(owner_id);
