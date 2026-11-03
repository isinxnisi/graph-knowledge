-- Private author submissions stay in the same transaction as member identity.
CREATE SCHEMA member_knowledge;
CREATE TABLE member_knowledge.submissions (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 current_revision integer NOT NULL CHECK(current_revision>0), state_version integer NOT NULL CHECK(state_version>0),
 state text NOT NULL CHECK(state IN ('draft','queued','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_submission_owner ON member_knowledge.submissions(owner_id,updated_at DESC,id);
CREATE TABLE member_knowledge.submission_revisions (
 submission_id uuid NOT NULL REFERENCES member_knowledge.submissions(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0), raw_input jsonb NOT NULL, content jsonb NOT NULL, digest text NOT NULL,
 source_capsule jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(submission_id,revision)
);
CREATE TABLE member_knowledge.submission_requests (
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 submission_id uuid NOT NULL REFERENCES member_knowledge.submissions(id) ON DELETE CASCADE,
 digest text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE member_knowledge.submission_receipts (
 submission_id uuid NOT NULL, revision integer NOT NULL, digest text NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(submission_id,revision),
 FOREIGN KEY(submission_id,revision) REFERENCES member_knowledge.submission_revisions(submission_id,revision) ON DELETE CASCADE
);
-- Works for CLI and Web suspensions alike. Resume never resubmits old work.
CREATE FUNCTION member_knowledge.cancel_suspended() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.active AND NOT NEW.active THEN
  UPDATE member_knowledge.submissions SET state='cancelled',state_version=state_version+1,updated_at=clock_timestamp()
   WHERE owner_id=NEW.id AND state<>'cancelled';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cancel_knowledge_submissions BEFORE UPDATE OF active ON "user"
 FOR EACH ROW EXECUTE FUNCTION member_knowledge.cancel_suspended();
