-- Operator content, independent from executable tool schemas and public knowledge.
CREATE TABLE site_editorial_guide_version (
 guide_id text NOT NULL CHECK(guide_id='theme-authoring-quality'),
 revision integer NOT NULL CHECK(revision>0),
 markdown text NOT NULL CHECK(length(btrim(markdown))>0 AND octet_length(markdown)<=512000),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 restored_from integer,
 created_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(guide_id,revision),
 FOREIGN KEY(guide_id,restored_from) REFERENCES site_editorial_guide_version(guide_id,revision)
);
ALTER TABLE site_operation_request DROP CONSTRAINT site_operation_request_target_kind_check;
ALTER TABLE site_operation_request ADD CONSTRAINT site_operation_request_target_kind_check
 CHECK(target_kind IN ('report','account','recovery','homepage','editorial-guide'));
