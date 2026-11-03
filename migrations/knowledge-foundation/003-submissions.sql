-- Private submission envelopes; never part of the public Record projection.
-- Owner identity is supplied by the authenticated server adapter, not the body.
CREATE TABLE knowledge75.submissions (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL,
  current_revision integer NOT NULL CHECK(current_revision > 0),
  state_version integer NOT NULL CHECK(state_version > 0),
  state text NOT NULL CHECK(state IN ('draft','queued','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge75_submission_owner ON knowledge75.submissions(owner_id,updated_at DESC,id);
CREATE TABLE knowledge75.submission_revisions (
  submission_id uuid NOT NULL REFERENCES knowledge75.submissions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision > 0),
  raw_input jsonb NOT NULL, content jsonb NOT NULL, digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(submission_id,revision)
);
CREATE TABLE knowledge75.submission_requests (
  owner_id uuid NOT NULL, request_id uuid NOT NULL,
  submission_id uuid NOT NULL REFERENCES knowledge75.submissions(id) ON DELETE CASCADE,
  digest text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE knowledge75.submission_receipts (
  submission_id uuid NOT NULL, revision integer NOT NULL,
  digest text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(submission_id,revision),
  FOREIGN KEY(submission_id,revision) REFERENCES knowledge75.submission_revisions(submission_id,revision) ON DELETE CASCADE
);
