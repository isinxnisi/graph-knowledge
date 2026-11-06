ALTER TABLE knowledge75.patrol_tasks DROP CONSTRAINT patrol_tasks_state_check;
ALTER TABLE knowledge75.patrol_tasks ADD CONSTRAINT patrol_tasks_state_check
 CHECK(state IN('pending','indexed','planned','unresolved','superseded'));
ALTER TABLE knowledge75.patrol_tasks ADD COLUMN next_attempt timestamptz NOT NULL DEFAULT now();
ALTER TABLE knowledge75.patrol_tasks ADD COLUMN comparison_cursor text;
CREATE TABLE knowledge75.organization_index (
 origin text NOT NULL,kind text NOT NULL,id text NOT NULL,
 target_generation integer NOT NULL,material jsonb NOT NULL,
 names text[] NOT NULL DEFAULT '{}',dependencies text[] NOT NULL DEFAULT '{}',meaning_key text,
 indexed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(origin,kind,id),
 FOREIGN KEY(origin,kind,id) REFERENCES knowledge75.patrol_targets(origin,kind,id)
);
CREATE INDEX organization_names ON knowledge75.organization_index USING gin(names);
CREATE INDEX organization_dependencies ON knowledge75.organization_index USING gin(dependencies);
CREATE INDEX organization_meaning ON knowledge75.organization_index(meaning_key);
CREATE TABLE knowledge75.organization_candidates (
 id text PRIMARY KEY,task_id text NOT NULL REFERENCES knowledge75.patrol_tasks(id),
 kind text NOT NULL CHECK(kind IN('meaning','identity')),
 policy text NOT NULL,input jsonb NOT NULL,input_hash text NOT NULL,
 state text NOT NULL CHECK(state IN('queued','running','retry','quota','verified','applied','unresolved','rejected','superseded')),
 stage text NOT NULL DEFAULT 'propose' CHECK(stage IN('propose','check')),
 proposal jsonb,decision jsonb,result jsonb,source_proof jsonb,reason text NOT NULL DEFAULT '',
 request_id uuid NOT NULL UNIQUE,
 attempts integer NOT NULL DEFAULT 0,next_attempt timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,lease_generation integer NOT NULL DEFAULT 0,
 current_attempt uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_candidates_due ON knowledge75.organization_candidates(state,next_attempt,created_at);
CREATE TABLE knowledge75.organization_attempts (
 id uuid PRIMARY KEY,candidate_id text NOT NULL REFERENCES knowledge75.organization_candidates(id),
 lease_generation integer NOT NULL,stage text NOT NULL,
 wire text NOT NULL,wire_hash text NOT NULL,model text NOT NULL,
 state text NOT NULL CHECK(state IN('reserved','sending','received','http-error','delivery-unknown','not-sent')),
 response jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE FUNCTION knowledge75.supersede_organization_candidates() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state='superseded' AND OLD.state<>'superseded' THEN
  UPDATE knowledge75.organization_candidates SET state='superseded',lease_token=NULL,lease_until=NULL,
   reason='対象の内容・公開状態が更新されました',updated_at=clock_timestamp()
  WHERE task_id=NEW.id AND state NOT IN('applied','rejected','superseded');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER supersede_organization_candidates AFTER UPDATE OF state ON knowledge75.patrol_tasks
 FOR EACH ROW EXECUTE FUNCTION knowledge75.supersede_organization_candidates();
