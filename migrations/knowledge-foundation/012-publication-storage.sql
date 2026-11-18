-- Additive cutover: existing generations remain readable without copying their rows.
SET LOCAL lock_timeout = '3s';
ALTER TABLE knowledge75.publication_generations
 ADD COLUMN content_digest text,
 ADD COLUMN graph_key text,
 ADD COLUMN graph_generation text REFERENCES knowledge75.publication_generations(id),
 ADD COLUMN retired_at timestamptz,
 ADD COLUMN expired_at timestamptz,
 ADD COLUMN purged_at timestamptz;
UPDATE knowledge75.publication_generations SET retired_at=clock_timestamp()
 WHERE state='ready' AND id IS DISTINCT FROM (SELECT active_generation FROM knowledge75.publication_control WHERE singleton);

CREATE TABLE knowledge75.publication_record_values (LIKE knowledge75.publication_records);
ALTER TABLE knowledge75.publication_record_values DROP COLUMN generation, ADD COLUMN projection text PRIMARY KEY;
CREATE TABLE knowledge75.publication_record_members (
 generation text NOT NULL REFERENCES knowledge75.publication_generations(id),
 id text NOT NULL, projection text NOT NULL REFERENCES knowledge75.publication_record_values(projection),
 PRIMARY KEY(generation,id)
);
CREATE INDEX publication_record_members_value ON knowledge75.publication_record_members(projection);
CREATE INDEX publication_record_values_search ON knowledge75.publication_record_values USING gin(search_text gin_trgm_ops);
CREATE INDEX publication_record_values_subject ON knowledge75.publication_record_values(subject_id,id);
CREATE INDEX publication_record_values_object ON knowledge75.publication_record_values(object_id,id);
CREATE INDEX publication_record_values_concept ON knowledge75.publication_record_values(concept_id,id);
CREATE INDEX publication_record_values_predicate ON knowledge75.publication_record_values(predicate,id);
CREATE INDEX publication_record_values_role ON knowledge75.publication_record_values(role_id,id);
CREATE INDEX publication_record_values_position ON knowledge75.publication_record_values(organization_position_id,id);
CREATE INDEX publication_record_values_event_role ON knowledge75.publication_record_values(event_role_id,id);
CREATE INDEX publication_record_values_event ON knowledge75.publication_record_values(event_id,event_from,event_to);
CREATE INDEX publication_record_values_isbn ON knowledge75.publication_record_values(isbn13,id);

CREATE TABLE knowledge75.publication_entity_values (
 projection text PRIMARY KEY, id text NOT NULL, revision integer NOT NULL, body jsonb NOT NULL
);
CREATE TABLE knowledge75.publication_entity_members (
 generation text NOT NULL REFERENCES knowledge75.publication_generations(id),
 id text NOT NULL, projection text NOT NULL REFERENCES knowledge75.publication_entity_values(projection),
 PRIMARY KEY(generation,id)
);
CREATE INDEX publication_entity_members_value ON knowledge75.publication_entity_members(projection);

CREATE VIEW knowledge75.publication_read_records AS
 SELECT * FROM knowledge75.publication_records
 UNION ALL
 SELECT m.generation,m.id,r.revision,r.body,r.dependencies,r.search_text,r.subject_id,r.object_id,
  r.relation_label,r.polarity,r.concept_id,r.predicate,r.role_id,r.isbn13,r.organization_position_id,
  r.event_role_id,r.event_id,r.event_from,r.event_to
 FROM knowledge75.publication_record_members m JOIN knowledge75.publication_record_values r USING(projection);
CREATE VIEW knowledge75.publication_read_entities AS
 SELECT * FROM knowledge75.publication_entities
 UNION ALL
 SELECT m.generation,m.id,e.revision,e.body
 FROM knowledge75.publication_entity_members m JOIN knowledge75.publication_entity_values e USING(projection);

-- One first-public context per original Record revision. It only becomes public
-- through the same current Record / Entity / Source gates as the legacy read.
CREATE TABLE knowledge75.publication_record_context (
 id text NOT NULL, revision integer NOT NULL,
 generation text NOT NULL REFERENCES knowledge75.publication_generations(id),
 published_at timestamptz NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(id,revision)
);

ALTER TABLE knowledge75.target_inventory_runs ADD COLUMN purged_at timestamptz;
CREATE INDEX target_inventory_reusable ON knowledge75.target_inventory_runs(origin,revision,completed_at DESC,id)
 WHERE state='complete' AND purged_at IS NULL;
DROP INDEX knowledge75.target_inventory_page;
