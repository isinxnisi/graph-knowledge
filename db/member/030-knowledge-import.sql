-- Service senders are distinct from member accounts and their submissions.
CREATE SCHEMA knowledge_import;
CREATE TABLE knowledge_import.packages(
 id uuid PRIMARY KEY, principal_id text NOT NULL, namespace text NOT NULL,
 package_id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 digest text NOT NULL, payload jsonb NOT NULL, resource_issues jsonb NOT NULL DEFAULT '[]',
 cancelled_at timestamptz, cancel_reason text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(namespace,package_id,revision)
);
CREATE TABLE knowledge_import.items(
 id uuid PRIMARY KEY, package_id uuid NOT NULL REFERENCES knowledge_import.packages(id),
 ordinal integer NOT NULL, item_key text, input_digest text NOT NULL,
 normalized jsonb, prepared jsonb, decision jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','retry','quota','needs-changes','declined','applying','applied','published','existing','cancelled')),
 reason text NOT NULL DEFAULT '', result jsonb, issues jsonb NOT NULL DEFAULT '[]',
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),prepare_day text,prepare_attempts integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid, lease_until timestamptz, current_attempt uuid REFERENCES member_knowledge.review_attempts(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(package_id,ordinal),UNIQUE(package_id,item_key)
);
CREATE INDEX knowledge_import_due ON knowledge_import.items(next_attempt,created_at) WHERE state IN('queued','retry','quota','applying','applied');
CREATE TABLE knowledge_import.attempts(
 id uuid PRIMARY KEY REFERENCES member_knowledge.review_attempts(id),
 item_id uuid NOT NULL REFERENCES knowledge_import.items(id), model text NOT NULL,
 wire text NOT NULL, wire_digest text NOT NULL,response jsonb,proofs jsonb NOT NULL,
 duplicates jsonb,started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge_import.bindings(
 namespace text NOT NULL,package_key text NOT NULL,item_key text NOT NULL,
 record_id text NOT NULL,content_revision integer NOT NULL,input_digest text NOT NULL,
 receipt_id uuid NOT NULL REFERENCES knowledge_import.packages(id),
 PRIMARY KEY(namespace,package_key,item_key)
);
CREATE FUNCTION knowledge_import.immutable_package() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.principal_id,NEW.namespace,NEW.package_id,NEW.revision,NEW.digest,NEW.payload)
 IS DISTINCT FROM (OLD.principal_id,OLD.namespace,OLD.package_id,OLD.revision,OLD.digest,OLD.payload)
 THEN RAISE EXCEPTION 'immutable import package'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_package BEFORE UPDATE ON knowledge_import.packages FOR EACH ROW EXECUTE FUNCTION knowledge_import.immutable_package();
