-- Private ChatGPT authoring handoffs; no collection plan or LLM job is created.
CREATE SCHEMA theme_production;
CREATE TABLE theme_production.cases (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN('beta','production')),origin text NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 phase text NOT NULL CHECK(phase IN('production','review')),
 status text NOT NULL CHECK(status IN('ready','working','waiting-publication','blocked','completed')),
 progress jsonb NOT NULL,theme_id text,theme_revision integer,
 execution_id uuid,lease_token uuid,lease_until timestamptz,last_production_execution uuid,
 assessment jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((theme_id IS NULL)=(theme_revision IS NULL)),CHECK((execution_id IS NULL)=(lease_token IS NULL)),CHECK((lease_token IS NULL)=(lease_until IS NULL))
);
CREATE UNIQUE INDEX theme_production_one_active ON theme_production.cases(owner_id,environment) WHERE status<>'completed';
CREATE TABLE theme_production.operations (
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,request_id uuid NOT NULL,
 case_id uuid NOT NULL REFERENCES theme_production.cases(id) ON DELETE CASCADE,digest text NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE theme_production.submissions (
 id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES theme_production.cases(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 command_action text NOT NULL,command_request_id uuid NOT NULL,command_wire text NOT NULL,digest text NOT NULL,
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','uncertain','accepted','pending','applied','failed','withdrawn')),
 result jsonb,reason text NOT NULL DEFAULT '',dispatches integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_id,command_action,command_request_id)
);
CREATE INDEX theme_production_submission_case ON theme_production.submissions(case_id,created_at,id);
CREATE FUNCTION theme_production.immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'production operation history is immutable'; END $$;
CREATE TRIGGER theme_production_immutable_operations BEFORE UPDATE ON theme_production.operations FOR EACH ROW EXECUTE FUNCTION theme_production.immutable_history();
CREATE FUNCTION theme_production.immutable_wire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.command_wire<>OLD.command_wire OR NEW.digest<>OLD.digest OR NEW.case_id<>OLD.case_id OR NEW.owner_id<>OLD.owner_id OR NEW.command_request_id<>OLD.command_request_id OR NEW.command_action<>OLD.command_action THEN RAISE EXCEPTION 'prepared production wire is immutable'; END IF;RETURN NEW;END $$;
CREATE TRIGGER theme_production_submission_wire BEFORE UPDATE ON theme_production.submissions FOR EACH ROW EXECUTE FUNCTION theme_production.immutable_wire();

-- Existing image GC also honors current case references, including after a lost
-- upload ACK. This DB boundary works with the unchanged resident worker image.
CREATE FUNCTION theme_production.retain_current_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM theme_production.cases c WHERE c.status<>'completed' AND (
   jsonb_path_exists(c.progress,'$.** ? (@ == $asset)',jsonb_build_object('asset',OLD.id)) OR EXISTS (
    SELECT 1 FROM theme_production.submissions s LEFT JOIN product_editorial_request p ON p.request_id=s.command_request_id AND p.owner_id=s.owner_id
    WHERE s.case_id=c.id AND s.state<>'withdrawn' AND (
     jsonb_path_exists(s.command_wire::jsonb,'$.** ? (@ == $asset)',jsonb_build_object('asset',OLD.id)) OR
     jsonb_path_exists(coalesce(s.result,p.result,'{}'::jsonb),'$.** ? (@ == $asset)',jsonb_build_object('asset',OLD.id))
    )
   )
  )
 ) THEN RETURN NULL; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER theme_production_keep_current_material BEFORE DELETE ON product_image_asset FOR EACH ROW EXECUTE FUNCTION theme_production.retain_current_material();
