-- Receipt-bound results and in-app unread state. Never mark results seen on GET.
ALTER TABLE member_knowledge.review_authorizations ADD COLUMN consent_profile_id text;
ALTER TABLE member_knowledge.review_jobs ADD COLUMN consent_profile_id text;
UPDATE member_knowledge.review_authorizations SET consent_profile_id=CASE consent_version
 WHEN 'gemini-public-beta-v1' THEN 'google-gemini-free-review-v1'
 WHEN 'gemini-publication-beta-v1' THEN 'google-gemini-free-publish-v1'
 ELSE 'legacy-unknown' END;
UPDATE member_knowledge.review_jobs SET consent_profile_id=CASE consent_version
 WHEN 'gemini-public-beta-v1' THEN 'google-gemini-free-review-v1'
 WHEN 'gemini-publication-beta-v1' THEN 'google-gemini-free-publish-v1'
 ELSE 'legacy-unknown' END;
ALTER TABLE member_knowledge.review_authorizations ALTER COLUMN consent_profile_id SET NOT NULL;
ALTER TABLE member_knowledge.review_jobs ALTER COLUMN consent_profile_id SET NOT NULL;
CREATE TABLE member_knowledge.feedback_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES member_knowledge.review_jobs(id) ON DELETE CASCADE,
 submission_id uuid NOT NULL, revision integer NOT NULL, item_key text NOT NULL,
 state text NOT NULL, outcome_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(job_id,outcome_hash),
 FOREIGN KEY(submission_id,revision) REFERENCES member_knowledge.submission_receipts(submission_id,revision) ON DELETE CASCADE
);
CREATE INDEX knowledge_feedback_receipt ON member_knowledge.feedback_events(submission_id,revision,id DESC);
CREATE INDEX knowledge_feedback_job ON member_knowledge.feedback_events(job_id,id DESC);
CREATE TABLE member_knowledge.feedback_seen (
 submission_id uuid NOT NULL, revision integer NOT NULL,
 through_event_id bigint NOT NULL CHECK(through_event_id>0),
 seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(submission_id,revision),
 FOREIGN KEY(submission_id,revision) REFERENCES member_knowledge.submission_receipts(submission_id,revision) ON DELETE CASCADE
);
CREATE FUNCTION member_knowledge.capture_feedback_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state IN ('needs-changes','declined','attention','published')
 OR NEW.state='reviewed' AND NEW.consent_version='gemini-public-beta-v1' THEN
  -- Allocate receipt event IDs in commit order. Otherwise a smaller ID from
  -- an uncommitted concurrent job could be hidden by acknowledging a later ID.
  PERFORM pg_advisory_xact_lock(hashtextextended('knowledge-feedback:'||NEW.submission_id::text,0));
  INSERT INTO member_knowledge.feedback_events(job_id,submission_id,revision,item_key,state,outcome_hash)
  VALUES(NEW.id,NEW.submission_id,NEW.revision,NEW.item_key,NEW.state,
   md5(jsonb_build_array(NEW.state,NEW.reason,NEW.result)::text))
  ON CONFLICT(job_id,outcome_hash) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_knowledge_feedback AFTER INSERT OR UPDATE OF state,reason,result ON member_knowledge.review_jobs
 FOR EACH ROW EXECUTE FUNCTION member_knowledge.capture_feedback_event();
-- Existing finished receipts get one honest result notification. No AI jobs,
-- private text copies or new publication decisions are generated.
INSERT INTO member_knowledge.feedback_events(job_id,submission_id,revision,item_key,state,outcome_hash)
 SELECT id,submission_id,revision,item_key,state,md5(jsonb_build_array(state,reason,result)::text)
 FROM member_knowledge.review_jobs
 WHERE state IN ('needs-changes','declined','attention','published')
 OR state='reviewed' AND consent_version='gemini-public-beta-v1';
