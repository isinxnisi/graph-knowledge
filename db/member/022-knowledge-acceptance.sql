-- Acceptance is a durable public decision, separate from erasable private drafts.
ALTER TABLE member_knowledge.review_jobs DROP CONSTRAINT review_jobs_state_check;
ALTER TABLE member_knowledge.review_jobs ADD CHECK(state IN ('queued','running','retry','quota','reviewed','needs-changes','declined','attention','cancelled','verifying','source-retry','accepted','published'));
CREATE TABLE member_knowledge.source_checks (
 job_id uuid PRIMARY KEY REFERENCES member_knowledge.review_jobs(id) ON DELETE CASCADE,
 attempts integer NOT NULL DEFAULT 0, token uuid, lease_until timestamptz,
 not_before timestamptz NOT NULL DEFAULT now(), proofs jsonb, reason text NOT NULL DEFAULT ''
);
-- Only sanitized, accepted public material is retained here. No owner/session,
-- Capsule ID, unselected content or private description. A future erasure of a
-- private account must not lose an accepted public operation in mid-delivery.
CREATE TABLE member_knowledge.publication_decisions (
 id uuid PRIMARY KEY, job_id uuid NOT NULL UNIQUE, command jsonb NOT NULL, digest text NOT NULL,
 references_json jsonb NOT NULL, proofs jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','published','blocked')),
 result jsonb, attempts integer NOT NULL DEFAULT 0, not_before timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE INDEX knowledge_decision_due ON member_knowledge.publication_decisions(state,not_before);
CREATE OR REPLACE FUNCTION member_knowledge.cancel_stale_reviews() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state<>'queued' OR NEW.current_revision<>OLD.current_revision THEN
  UPDATE member_knowledge.review_jobs SET state='cancelled',reason='submission-changed',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
  WHERE submission_id=NEW.id AND state IN ('queued','running','retry','quota','reviewed','verifying','source-retry');
 END IF;
 RETURN NEW;
END $$;
