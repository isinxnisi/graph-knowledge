-- The bearer seed is immutable even when its published target changes.
ALTER TABLE member_capsule_share ADD COLUMN token_revision bigint;
UPDATE member_capsule_share SET token_revision = revision;
ALTER TABLE member_capsule_share ALTER COLUMN token_revision SET NOT NULL;
ALTER TABLE member_capsule_share ADD CONSTRAINT member_capsule_share_token_revision_check CHECK (token_revision BETWEEN 1 AND 9007199254740991);
ALTER TABLE member_capsule_share ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE member_capsule_share SET updated_at = created_at;
-- Keep the publication record after revocation; reads always join a LIVE share.
-- Community snapshots are deliberately not backfilled into this audience.
CREATE TABLE member_capsule_publication (
  share_id uuid NOT NULL,
  capsule_id uuid NOT NULL,
  revision bigint NOT NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (share_id, revision),
  FOREIGN KEY (capsule_id, revision) REFERENCES member_capsule_revision(capsule_id, revision) ON DELETE CASCADE
);
CREATE INDEX member_capsule_publication_capsule ON member_capsule_publication(capsule_id, revision);
INSERT INTO member_capsule_publication(share_id,capsule_id,revision,published_at)
SELECT id,capsule_id,revision,created_at FROM member_capsule_share;
