-- Non-destructive, version-bound identity decisions. No original IDs are replaced.
CREATE TABLE knowledge75.entity_identity_links (
 id text PRIMARY KEY, left_id text NOT NULL, right_id text NOT NULL,
 current_revision integer NOT NULL CHECK(current_revision>0),
 CHECK(left_id<right_id), UNIQUE(left_id,right_id)
);
CREATE TABLE knowledge75.entity_identity_revisions (
 sequence bigserial UNIQUE, link_id text NOT NULL REFERENCES knowledge75.entity_identity_links(id),
 revision integer NOT NULL CHECK(revision>0),
 left_kind text NOT NULL DEFAULT 'entity' CHECK(left_kind='entity'),left_id text NOT NULL,left_revision integer NOT NULL,
 right_kind text NOT NULL DEFAULT 'entity' CHECK(right_kind='entity'),right_id text NOT NULL,right_revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('same','withdrawn')),
 reason text NOT NULL,reference text NOT NULL,locator text NOT NULL,actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(link_id,revision),
 FOREIGN KEY(left_kind,left_id,left_revision) REFERENCES knowledge75.revisions(kind,id,revision),
 FOREIGN KEY(right_kind,right_id,right_revision) REFERENCES knowledge75.revisions(kind,id,revision),
 CHECK(left_id<right_id)
);
CREATE TABLE knowledge75.entity_identity_requests (
 actor_id text NOT NULL,request_id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,request_id)
);
CREATE INDEX knowledge75_identity_left ON knowledge75.entity_identity_links(left_id);
CREATE INDEX knowledge75_identity_right ON knowledge75.entity_identity_links(right_id);
