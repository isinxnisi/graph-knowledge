-- Private, explicitly authorized review jobs. Never backfill earlier receipts.
CREATE TABLE member_knowledge.review_jobs (
 id uuid PRIMARY KEY, submission_id uuid NOT NULL, revision integer NOT NULL,
 item_key text NOT NULL, submitted_digest text NOT NULL, consent_version text NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','retry','quota','reviewed','needs-changes','declined','attention','cancelled')),
 reason text NOT NULL DEFAULT '', result jsonb, attempts integer NOT NULL DEFAULT 0,
 not_before timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(submission_id,revision,item_key),
 FOREIGN KEY(submission_id,revision) REFERENCES member_knowledge.submission_receipts(submission_id,revision) ON DELETE CASCADE
);
CREATE INDEX knowledge_review_due ON member_knowledge.review_jobs(state,not_before);
CREATE TABLE member_knowledge.review_authorizations (
 submission_id uuid NOT NULL, revision integer NOT NULL, consent_version text NOT NULL,
 authorized_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(submission_id,revision),
 FOREIGN KEY(submission_id,revision) REFERENCES member_knowledge.submission_receipts(submission_id,revision) ON DELETE CASCADE
);
-- Quota remains charged after a private submission/account is erased. No user,
-- text, source URL or provider response is retained in this usage-only table.
CREATE TABLE member_knowledge.review_attempts (
 id uuid PRIMARY KEY, job_id uuid REFERENCES member_knowledge.review_jobs(id) ON DELETE SET NULL,
 project_id text NOT NULL, provider text NOT NULL, model text NOT NULL, policy text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('submission','evaluation')),
 state text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 quota_day date NOT NULL, quota_month text NOT NULL, request_charge integer NOT NULL DEFAULT 1 CHECK(request_charge IN(0,1)),
 input_reserved integer NOT NULL, output_reserved integer NOT NULL,
 input_actual integer, output_actual integer, thoughts_actual integer, cached_actual integer, total_actual integer, candidates_actual integer
);
CREATE INDEX knowledge_review_usage ON member_knowledge.review_attempts(project_id,started_at);
CREATE TABLE member_knowledge.review_payloads (
 attempt_id uuid PRIMARY KEY REFERENCES member_knowledge.review_attempts(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES member_knowledge.review_jobs(id) ON DELETE CASCADE,
 wire text NOT NULL, wire_digest text NOT NULL, response jsonb
);
CREATE TABLE member_knowledge.review_projects (
 project_id text PRIMARY KEY, paused_until timestamptz, pause_reason text NOT NULL DEFAULT '',
 heartbeat_at timestamptz, config_digest text NOT NULL
);
CREATE TABLE member_knowledge.review_imports (digest text PRIMARY KEY, project_id text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE member_knowledge.advice_requests (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_advice_owner ON member_knowledge.advice_requests(owner_id,created_at);
-- A save, cancellation, suspension or deletion invalidates the current lease.
-- All writers lock user -> submission -> job, and never hold locks during HTTP.
CREATE FUNCTION member_knowledge.cancel_stale_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state<>'queued' OR NEW.current_revision<>OLD.current_revision THEN
  UPDATE member_knowledge.review_jobs SET state='cancelled',reason='submission-changed',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
  WHERE submission_id=NEW.id AND state IN ('queued','running','retry','quota');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancel_stale_knowledge_reviews AFTER UPDATE ON member_knowledge.submissions
 FOR EACH ROW EXECUTE FUNCTION member_knowledge.cancel_stale_reviews();
