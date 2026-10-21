-- Human community C1. No Capsule or KG FK; conversations have independent lifetimes.
CREATE TABLE community (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 visibility text NOT NULL CHECK(visibility IN ('public','members')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','suspended')),
 revision integer NOT NULL DEFAULT 1, created_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE community_member (
 community_id uuid NOT NULL REFERENCES community(id), user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('member','admin')), status text NOT NULL CHECK(status IN ('active','left','removed','suspended')),
 generation integer NOT NULL DEFAULT 1, admin_offered boolean NOT NULL DEFAULT false,
 PRIMARY KEY(community_id,user_id)
);
CREATE TABLE community_thread (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid NOT NULL REFERENCES community(id),
 author_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120), audience text NOT NULL CHECK(audience IN ('public','cohort')),
 closed boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE community_audience_member (
 thread_id uuid NOT NULL REFERENCES community_thread(id), user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 generation integer NOT NULL, PRIMARY KEY(thread_id,user_id)
);
CREATE TABLE community_post (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL REFERENCES community_thread(id),
 author_id uuid REFERENCES "user"(id) ON DELETE SET NULL, body text NOT NULL CHECK(length(body)<=2000),
 status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','withdrawn','hidden')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE community_request (
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, request_id uuid NOT NULL, hash text NOT NULL,
 result_id uuid NOT NULL, PRIMARY KEY(user_id,request_id)
);
CREATE TABLE community_operation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, community_id uuid NOT NULL REFERENCES community(id),
 actor_id uuid REFERENCES "user"(id) ON DELETE SET NULL, action text NOT NULL, target_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX community_directory ON community(created_at,id) WHERE visibility='public';
CREATE INDEX community_memberships ON community_member(user_id,status,community_id);
CREATE INDEX community_threads ON community_thread(community_id,created_at,id);
CREATE INDEX community_posts ON community_post(thread_id,created_at,id);
