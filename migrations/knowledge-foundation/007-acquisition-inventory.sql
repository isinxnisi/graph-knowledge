-- Internal verification observations are separate from source editions and citations.
CREATE TABLE knowledge75.source_acquisitions (
 id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),
 actor_id text NOT NULL, request_id uuid NOT NULL,
 policy text NOT NULL, proof jsonb NOT NULL,
 document_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(actor_id,request_id) REFERENCES knowledge75.operations(actor_id,request_id)
);
CREATE TABLE knowledge75.source_acquisition_links (
 acquisition_id text NOT NULL REFERENCES knowledge75.source_acquisitions(id),
 record_kind text NOT NULL DEFAULT 'record' CHECK(record_kind='record'),
 record_id text NOT NULL, record_revision integer NOT NULL,
 source_kind text NOT NULL DEFAULT 'source' CHECK(source_kind='source'),
 source_id text NOT NULL, source_revision integer NOT NULL,
 evidence_id text NOT NULL,
 PRIMARY KEY(acquisition_id,record_id,record_revision,source_id,source_revision,evidence_id),
 FOREIGN KEY(record_kind,record_id,record_revision) REFERENCES knowledge75.revisions(kind,id,revision),
 FOREIGN KEY(source_kind,source_id,source_revision) REFERENCES knowledge75.revisions(kind,id,revision)
);
CREATE INDEX source_acquisition_source ON knowledge75.source_acquisition_links(source_id,source_revision);

-- A completed inventory generation is immutable. An incomplete page must never
-- imply that unvisited targets disappeared. Neither table mutates KG or originals.
CREATE TABLE knowledge75.target_inventory_runs (
 id uuid PRIMARY KEY, origin text NOT NULL CHECK(origin IN('common','public-kg')),
 revision text NOT NULL, state text NOT NULL CHECK(state IN('scanning','complete','stale')),
 cursor jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX target_inventory_active ON knowledge75.target_inventory_runs(origin) WHERE state='scanning';
CREATE TABLE knowledge75.target_inventory_entries (
 run_id uuid NOT NULL REFERENCES knowledge75.target_inventory_runs(id),
 kind text NOT NULL CHECK(kind IN('entity','record','source','theme','mapping')),
 id text NOT NULL, revision text NOT NULL, status_revision text NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 visibility text NOT NULL, eligible boolean NOT NULL,
 PRIMARY KEY(run_id,kind,id)
);
CREATE INDEX target_inventory_page ON knowledge75.target_inventory_entries(run_id,kind,id);
