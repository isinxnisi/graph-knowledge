-- Immutable public read models; the original records and migration 001 stay intact.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE knowledge75.publication_generations (
  id text PRIMARY KEY, state text NOT NULL CHECK(state IN ('staged','ready','failed')),
  source_sequence bigint NOT NULL, digest text NOT NULL,
  record_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, error text
);
CREATE TABLE knowledge75.publication_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  active_generation text REFERENCES knowledge75.publication_generations(id)
);
INSERT INTO knowledge75.publication_control(singleton,active_generation) VALUES(true,NULL);
CREATE TABLE knowledge75.publication_records (
  generation text NOT NULL REFERENCES knowledge75.publication_generations(id),
  id text NOT NULL, revision integer NOT NULL, body jsonb NOT NULL,
  dependencies jsonb NOT NULL, search_text text NOT NULL,
  subject_id text, object_id text, relation_label text NOT NULL, polarity text NOT NULL,
  concept_id text, predicate text, role_id text, isbn13 text,
  organization_position_id text, event_role_id text, event_id text,
  event_from date, event_to date,
  PRIMARY KEY(generation,id)
);
CREATE TABLE knowledge75.publication_entities (
  generation text NOT NULL REFERENCES knowledge75.publication_generations(id),
  id text NOT NULL, revision integer NOT NULL, body jsonb NOT NULL,
  PRIMARY KEY(generation,id)
);
CREATE INDEX knowledge75_publication_search ON knowledge75.publication_records USING gin(search_text gin_trgm_ops);
CREATE INDEX knowledge75_publication_subject ON knowledge75.publication_records(generation,subject_id,id);
CREATE INDEX knowledge75_publication_object ON knowledge75.publication_records(generation,object_id,id);
CREATE INDEX knowledge75_publication_concept ON knowledge75.publication_records(generation,concept_id,id);
CREATE INDEX knowledge75_publication_predicate ON knowledge75.publication_records(generation,predicate,id);
CREATE INDEX knowledge75_publication_role ON knowledge75.publication_records(generation,role_id,id);
CREATE INDEX knowledge75_publication_position ON knowledge75.publication_records(generation,organization_position_id,id);
CREATE INDEX knowledge75_publication_event_role ON knowledge75.publication_records(generation,event_role_id,id);
CREATE INDEX knowledge75_publication_event ON knowledge75.publication_records(generation,event_id,event_from,event_to);
CREATE INDEX knowledge75_publication_isbn ON knowledge75.publication_records(generation,isbn13,id);

-- A sequence is allocated before commit. Acknowledging the observed set avoids
-- losing a lower sequence whose transaction commits after a higher one.
CREATE TABLE knowledge75.publication_seen_changes (
  sequence bigint PRIMARY KEY REFERENCES knowledge75.changes(sequence),
  generation text NOT NULL REFERENCES knowledge75.publication_generations(id)
);
