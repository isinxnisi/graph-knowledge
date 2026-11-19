-- Ordinary edits have their own head. Existing working revisions, releases and
-- pending requests keep their exact IDs. Only newly written drafts are eligible
-- for the ordinary publication operation.
CREATE TABLE knowledge75.theme_editorial_lineage (
  theme_kind text GENERATED ALWAYS AS ('theme'::text) STORED,
  theme_id text NOT NULL,
  revision integer NOT NULL,
  parent_revision integer CHECK (parent_revision < revision),
  inherited_translations jsonb,
  PRIMARY KEY (theme_id,revision),
  FOREIGN KEY (theme_kind,theme_id,revision) REFERENCES knowledge75.revisions(kind,id,revision),
  FOREIGN KEY (theme_kind,theme_id,parent_revision) REFERENCES knowledge75.revisions(kind,id,revision)
);
CREATE TABLE knowledge75.theme_operator_drafts (
  theme_id text PRIMARY KEY REFERENCES knowledge75.theme_publications(theme_id) ON DELETE CASCADE,
  revision integer NOT NULL,
  base_revision integer,
  base_release_id text,
  FOREIGN KEY (theme_id,revision) REFERENCES knowledge75.theme_editorial_lineage(theme_id,revision)
);
ALTER TABLE knowledge75.theme_publications
  ADD COLUMN production_conflict jsonb;
