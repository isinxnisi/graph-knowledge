-- Canonical reference snapshots are separate from optional Capsule provenance.
ALTER TABLE member_knowledge.submission_revisions ADD COLUMN reference_context jsonb;
COMMENT ON COLUMN member_knowledge.submission_revisions.reference_context IS 'Server captured canonical Entity/Record/Theme/legacy references; immutable per private revision';
