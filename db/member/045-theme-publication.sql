-- Completion commits before public activation. Immutable proof/wire survives lost ACKs.
CREATE TABLE theme_production.publication_intents (
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES theme_production.cases(id),owner_id uuid NOT NULL REFERENCES "user"(id),
 theme_id text NOT NULL,theme_revision integer NOT NULL CHECK(theme_revision>0),target_digest text NOT NULL,
 guide_revision integer NOT NULL,assessment jsonb NOT NULL,completion_command jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_production_publication_case ON theme_production.publication_intents(case_id,created_at DESC);
CREATE TRIGGER theme_production_immutable_publication_intents BEFORE UPDATE OR DELETE ON theme_production.publication_intents FOR EACH ROW EXECUTE FUNCTION theme_production.immutable_history();
