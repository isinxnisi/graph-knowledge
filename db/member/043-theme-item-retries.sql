-- Operator registration retry control. No existing item is rescheduled here.
ALTER TABLE knowledge_import.items ADD COLUMN retry_paused boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_import.items ADD COLUMN retry_initialized boolean NOT NULL DEFAULT false;
ALTER TABLE knowledge_import.items ADD COLUMN prepare_total bigint NOT NULL DEFAULT 0 CHECK(prepare_total>=0);
CREATE TABLE knowledge_missions.theme_retry_operations (
 request_id uuid PRIMARY KEY, registration_id uuid NOT NULL REFERENCES knowledge_missions.theme_registrations(request_id),
 owner_id uuid NOT NULL REFERENCES "user"(id), digest text NOT NULL, action text NOT NULL CHECK(action IN('retry','pause','resume')),
 reason text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_retry_operation_owner ON knowledge_missions.theme_retry_operations(owner_id,created_at);
CREATE TABLE knowledge_missions.theme_retry_legacy (
 item_id uuid NOT NULL REFERENCES knowledge_import.items(id), url text NOT NULL, quota_day text NOT NULL,
 attempts integer NOT NULL CHECK(attempts>=0), PRIMARY KEY(item_id,url,quota_day)
);
CREATE TABLE knowledge_missions.theme_source_attempts (
 id uuid PRIMARY KEY, item_id uuid NOT NULL REFERENCES knowledge_import.items(id), input_revision integer NOT NULL,
 lease_token uuid NOT NULL, url text NOT NULL, host text NOT NULL, quota_day text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), deadline timestamptz NOT NULL DEFAULT clock_timestamp()+interval '50 seconds'
);
CREATE INDEX theme_source_item_url ON knowledge_missions.theme_source_attempts(item_id,url,quota_day);
CREATE INDEX theme_source_day ON knowledge_missions.theme_source_attempts(quota_day);
CREATE INDEX theme_source_recent ON knowledge_missions.theme_source_attempts(started_at);
CREATE TABLE knowledge_missions.theme_source_results (
 attempt_id uuid PRIMARY KEY REFERENCES knowledge_missions.theme_source_attempts(id),
 http_status integer, outcome text NOT NULL CHECK(outcome IN('verified','failed')), reason text NOT NULL, wait_until timestamptz,
 finished_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge_missions.theme_source_host_waits (
 host text PRIMARY KEY, wait_until timestamptz NOT NULL, reason text NOT NULL
);
CREATE FUNCTION knowledge_missions.reject_retry_history_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'retry history is immutable'; END $$;
CREATE TRIGGER immutable_retry_operations BEFORE UPDATE ON knowledge_missions.theme_retry_operations FOR EACH ROW EXECUTE FUNCTION knowledge_missions.reject_retry_history_update();
CREATE TRIGGER immutable_retry_attempts BEFORE UPDATE ON knowledge_missions.theme_source_attempts FOR EACH ROW EXECUTE FUNCTION knowledge_missions.reject_retry_history_update();
CREATE TRIGGER immutable_retry_results BEFORE UPDATE ON knowledge_missions.theme_source_results FOR EACH ROW EXECUTE FUNCTION knowledge_missions.reject_retry_history_update();
CREATE TRIGGER immutable_retry_legacy BEFORE UPDATE ON knowledge_missions.theme_retry_legacy FOR EACH ROW EXECUTE FUNCTION knowledge_missions.reject_retry_history_update();
