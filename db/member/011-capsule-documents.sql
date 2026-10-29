-- Explicit opt-in. Existing reference-only rows and immutable snapshots remain
-- byte-for-byte unchanged; the first explicit content save upgrades a document.
ALTER TABLE member_capsule DROP CONSTRAINT member_capsule_schema_version_check;
ALTER TABLE member_capsule ADD CONSTRAINT member_capsule_schema_version_check CHECK (schema_version IN (1,2));
ALTER TABLE member_capsule_revision ADD COLUMN sharing_blocked boolean NOT NULL DEFAULT false;

-- Receipts retain only operation identity, digest and resulting revision, never
-- private content history. Deleting a Capsule does not make a retry recreate it.
CREATE TABLE member_capsule_update_request (
 owner_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 capsule_id uuid NOT NULL,
 expected_revision bigint NOT NULL,
 result_revision bigint NOT NULL,
 content_hash text NOT NULL,
 PRIMARY KEY(owner_user_id,request_id)
);
