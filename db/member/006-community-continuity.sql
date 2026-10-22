CREATE TABLE community_invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES community(id),
 target_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 issuer_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 issuer_generation integer NOT NULL, target_generation integer NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
 readmission boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX community_pending_invitation ON community_invitation(community_id,target_id) WHERE status='pending';
CREATE INDEX community_inbox ON community_invitation(target_id,created_at,id);
CREATE TABLE community_recovery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES community(id),
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, member_generation integer NOT NULL,
 readmission_required boolean NOT NULL DEFAULT false, readmission_approved boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','consumed')),
 revision integer NOT NULL DEFAULT 1, case_reference text, decided_by text,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX community_pending_recovery ON community_recovery(community_id,user_id) WHERE status IN ('pending','approved');
CREATE INDEX community_recoveries ON community_recovery(user_id,created_at,id);
ALTER TABLE community_operation ADD COLUMN operator_id text;
ALTER TABLE community_operation ADD COLUMN case_reference text;

CREATE INDEX community_invitation_issuer ON community_invitation(issuer_id,community_id) WHERE status='pending';

CREATE INDEX community_thread_author_time ON community_thread(author_id,created_at);
CREATE INDEX community_post_author_time ON community_post(author_id,created_at);
