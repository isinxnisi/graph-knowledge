-- Capsule comments join the existing bounded site-report inbox. No KG changes.
ALTER TABLE member_capsule_post ADD COLUMN moderation_revision integer NOT NULL DEFAULT 1;
ALTER TABLE member_capsule_post ADD COLUMN hidden_report_id uuid;
ALTER TABLE community_report ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE community_report DROP CONSTRAINT community_report_target_kind_check;
ALTER TABLE community_report ADD CONSTRAINT community_report_target_kind_check
 CHECK(target_kind IN ('community','thread','post','capsule','capsule-post'));
ALTER TABLE community_report ADD COLUMN capsule_share_id uuid REFERENCES member_capsule_share(id) ON DELETE SET NULL;
ALTER TABLE community_report ADD CONSTRAINT community_report_scope_check CHECK(
 (target_kind='capsule-post' AND community_id IS NULL AND target_capsule_id IS NOT NULL AND target_capsule_revision IS NOT NULL)
 OR (target_kind<>'capsule-post' AND community_id IS NOT NULL));
ALTER TABLE community_operation ALTER COLUMN community_id DROP NOT NULL;
ALTER TABLE community_operation ADD CONSTRAINT community_operation_scope_check
 CHECK(community_id IS NOT NULL OR target_kind IS NOT DISTINCT FROM 'capsule-post');
