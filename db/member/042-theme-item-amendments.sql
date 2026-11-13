-- Pending operator theme item inputs are versioned; immutable original envelopes stay intact.
ALTER TABLE knowledge_import.items ADD COLUMN input_revision integer NOT NULL DEFAULT 1 CHECK(input_revision>0), ADD COLUMN input_package jsonb;
CREATE TABLE knowledge_missions.theme_item_amendments(
 request_id uuid PRIMARY KEY,
 registration_id uuid NOT NULL REFERENCES knowledge_missions.theme_registrations(request_id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 digest text NOT NULL,reason text NOT NULL,response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_item_amendment_owner ON knowledge_missions.theme_item_amendments(owner_id,created_at);
CREATE TABLE knowledge_missions.theme_item_input_revisions(
 item_id uuid NOT NULL REFERENCES knowledge_import.items(id),
 revision integer NOT NULL CHECK(revision>0),
 registration_id uuid NOT NULL REFERENCES knowledge_missions.theme_registrations(request_id) ON DELETE CASCADE,
 amendment_id uuid REFERENCES knowledge_missions.theme_item_amendments(request_id) ON DELETE CASCADE,
 input jsonb NOT NULL,input_digest text NOT NULL,prior_state text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(item_id,revision)
);
CREATE FUNCTION knowledge_missions.immutable_item_amendment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable theme item input history'; END $$;
CREATE TRIGGER immutable_theme_item_amendment BEFORE UPDATE ON knowledge_missions.theme_item_amendments FOR EACH ROW EXECUTE FUNCTION knowledge_missions.immutable_item_amendment();
CREATE TRIGGER immutable_theme_item_input BEFORE UPDATE ON knowledge_missions.theme_item_input_revisions FOR EACH ROW EXECUTE FUNCTION knowledge_missions.immutable_item_amendment();
