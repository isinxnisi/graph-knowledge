-- A listing grants access to one immutable personal Capsule revision. Neither
-- deletion nor ownership changes cascade into independent community discourse.
CREATE TABLE community_capsule_listing (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id uuid NOT NULL REFERENCES community(id),
 capsule_id uuid NOT NULL,
 capsule_revision bigint NOT NULL,
 owner_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 issuer_generation integer NOT NULL,
 audience text NOT NULL CHECK(audience IN ('public','cohort')),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 thread_id uuid REFERENCES community_thread(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn')),
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX community_capsule_directory ON community_capsule_listing(community_id,created_at,id) WHERE status='active';
CREATE TABLE community_capsule_audience (
 listing_id uuid NOT NULL REFERENCES community_capsule_listing(id),
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 generation integer NOT NULL,
 PRIMARY KEY(listing_id,user_id)
);
ALTER TABLE community_report DROP CONSTRAINT community_report_target_kind_check;
ALTER TABLE community_report ADD CONSTRAINT community_report_target_kind_check CHECK(target_kind IN ('community','thread','post','capsule'));
ALTER TABLE community_report ADD COLUMN target_capsule_id uuid;
ALTER TABLE community_report ADD COLUMN target_capsule_revision bigint;
