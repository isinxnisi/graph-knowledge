-- A thread belongs to a Capsule; each post belongs to an immutable shared revision.
CREATE TABLE member_capsule_thread (
  capsule_id uuid PRIMARY KEY REFERENCES member_capsule(id) ON DELETE CASCADE,
  closed boolean NOT NULL DEFAULT true
);
CREATE TABLE member_capsule_post (
  id uuid PRIMARY KEY,
  capsule_id uuid NOT NULL REFERENCES member_capsule_thread(capsule_id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  author_user_id uuid NOT NULL REFERENCES "user"(id),
  request_id uuid NOT NULL,
  content_hash text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  withdrawn_at timestamptz,
  FOREIGN KEY (capsule_id, revision) REFERENCES member_capsule_revision(capsule_id, revision) ON DELETE CASCADE,
  UNIQUE (author_user_id, request_id),
  CHECK ((withdrawn_at IS NULL AND body IS NOT NULL AND char_length(body) BETWEEN 1 AND 2000)
    OR (withdrawn_at IS NOT NULL AND body IS NULL))
);
CREATE INDEX member_capsule_post_context ON member_capsule_post(capsule_id, revision, created_at, id);
CREATE INDEX member_capsule_post_rate ON member_capsule_post(author_user_id, created_at);
