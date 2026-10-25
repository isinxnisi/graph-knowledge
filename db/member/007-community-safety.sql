-- C3-min. Additive only; never applied during application startup.
ALTER TABLE community ADD COLUMN suspended_from text CHECK(suspended_from IN ('active','archived'));
ALTER TABLE community_post ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE community_post ADD COLUMN hidden_by text CHECK(hidden_by IN ('community','site'));
ALTER TABLE community_post ADD COLUMN hidden_at timestamptz;
ALTER TABLE community_post ADD COLUMN community_hidden boolean NOT NULL DEFAULT false;

CREATE TABLE community_report (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id uuid NOT NULL REFERENCES community(id),
 target_kind text NOT NULL CHECK(target_kind IN ('community','thread','post')),
 target_id uuid NOT NULL, target_revision integer NOT NULL,
 content_hash text NOT NULL,
 reporter_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 reporter_generation integer,
 category text NOT NULL CHECK(category IN ('spam','harassment','privacy','other')),
 detail text NOT NULL CHECK(length(detail) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 revision integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX community_report_open ON community_report(reporter_id,target_kind,target_id) WHERE status='open';
CREATE INDEX community_report_inbox ON community_report(reporter_id,created_at,id);
CREATE INDEX community_report_rate ON community_report(reporter_id,created_at);
ALTER TABLE community_operation ADD COLUMN reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500);
ALTER TABLE community_operation ADD COLUMN target_kind text;
ALTER TABLE community_operation ADD COLUMN report_id uuid REFERENCES community_report(id);
ALTER TABLE community_operation ADD COLUMN event_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX community_operation_event ON community_operation(event_id);
CREATE INDEX community_audit_page ON community_operation(community_id,id);
CREATE TABLE community_rate (
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 action text NOT NULL, window_start bigint NOT NULL, used integer NOT NULL,
 PRIMARY KEY(user_id,action)
);
