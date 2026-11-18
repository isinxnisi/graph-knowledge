-- Only trusted accept-record writes populate this immutable ancestry. Editorial
-- revisions remain on the existing review/publication path.
CREATE TABLE knowledge75.theme_knowledge_revisions (
 theme_id text NOT NULL, revision integer NOT NULL,
 parent_revision integer NOT NULL CHECK(parent_revision>0 AND parent_revision<revision),
 channel text NOT NULL CHECK(channel IN('published','working')),
 record_id text NOT NULL, record_revision integer NOT NULL CHECK(record_revision>0),
 actor_id text NOT NULL, request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(theme_id,revision),
 FOREIGN KEY(actor_id,request_id) REFERENCES knowledge75.operations(actor_id,request_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(theme_id) REFERENCES knowledge75.theme_publications(theme_id)
);
CREATE TRIGGER knowledge_immutable_theme_knowledge_revision BEFORE UPDATE OR DELETE ON knowledge75.theme_knowledge_revisions
 FOR EACH ROW EXECUTE FUNCTION knowledge75.immutable_theme_approval();
