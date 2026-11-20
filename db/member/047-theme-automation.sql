-- Material generation and private review evidence. Production/review claims and publication still use their existing workflow.
CREATE TABLE theme_production.automation_requests (
 id uuid PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES theme_production.cases(id) ON DELETE CASCADE,
 execution_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('image','preview')),
 digest text NOT NULL,
 input jsonb NOT NULL,
 target jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','generated','storing','ready','blocked')),
 reason text,
 attempt_id uuid,
 attempt_count integer NOT NULL DEFAULT 0,
 lease_until timestamptz,
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 provider text,
 provider_started_at timestamptz,
 generated_bytes bytea,
 image_id text,
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_automation_claim ON theme_production.automation_requests(kind,state,available_at);
CREATE INDEX theme_automation_case ON theme_production.automation_requests(case_id,kind,created_at DESC);

CREATE TABLE theme_production.preview_grants (
 token_hash text PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES theme_production.automation_requests(id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE theme_production.preview_evidence (
 request_id uuid NOT NULL REFERENCES theme_production.automation_requests(id) ON DELETE CASCADE,
 name text NOT NULL,
 bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 900000),
 PRIMARY KEY(request_id,name)
);
CREATE TABLE theme_production.preview_reads (
 request_id uuid NOT NULL REFERENCES theme_production.automation_requests(id) ON DELETE CASCADE,
 execution_id uuid NOT NULL,
 name text NOT NULL,
 PRIMARY KEY(request_id,execution_id,name)
);
CREATE TABLE theme_production.diagnostics (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ingress_id uuid,
 case_id uuid,
 request_id uuid,
 execution_id uuid,
 attempt_id uuid,
 environment text NOT NULL CHECK (environment IN ('beta','production')),
 build text,
 stage text NOT NULL,
 code text NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX theme_diagnostics_at ON theme_production.diagnostics(at);
CREATE INDEX theme_diagnostics_case ON theme_production.diagnostics(case_id,id DESC);
CREATE INDEX theme_diagnostics_request ON theme_production.diagnostics(request_id,id DESC);
CREATE INDEX theme_diagnostics_ingress ON theme_production.diagnostics(ingress_id,id);
CREATE FUNCTION theme_production.keep_generated_image() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM theme_production.automation_requests a JOIN theme_production.cases c ON c.id=a.case_id
  LEFT JOIN product_editorial_request p ON p.request_id=a.id AND p.owner_id=c.owner_id
  WHERE c.status<>'completed' AND (a.image_id=OLD.id OR p.result->>'imageId'=OLD.id)
 ) THEN RETURN NULL; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER theme_automation_keep_image BEFORE DELETE ON product_image_asset FOR EACH ROW EXECUTE FUNCTION theme_production.keep_generated_image();
