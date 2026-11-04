-- A translation belongs to one immutable original field, not its latest text.
CREATE TABLE knowledge75.text_translation_heads (
 id text PRIMARY KEY,target jsonb NOT NULL,language text NOT NULL,
 current_revision integer NOT NULL CHECK(current_revision>0),
 status_revision integer NOT NULL DEFAULT 1 CHECK (status_revision > 0),
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','hidden'))
);
CREATE TABLE knowledge75.text_translation_revisions (
 id text NOT NULL REFERENCES knowledge75.text_translation_heads(id),revision integer NOT NULL CHECK(revision>0),
 text text NOT NULL,original_text text NOT NULL,original_hash text NOT NULL,
 reason text NOT NULL,actor_kind text NOT NULL,actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(id,revision)
);
CREATE INDEX text_translation_target ON knowledge75.text_translation_heads((target->>'kind'),(target->>'id'));
