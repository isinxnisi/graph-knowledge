-- Structured revisions have one body. Legacy callers receive a Markdown projection.
ALTER TABLE site_editorial_guide_version
 ALTER COLUMN markdown DROP NOT NULL,
 ADD COLUMN work_guide jsonb,
 ADD COLUMN criteria_revision integer,
 ADD COLUMN evidence_revision integer,
 ADD COLUMN changed_sections text[],
 ADD COLUMN section_versions jsonb,
 ADD CHECK ((markdown IS NULL) <> (work_guide IS NULL)),
 ADD CHECK ((work_guide IS NULL AND criteria_revision IS NULL AND evidence_revision IS NULL)
  OR (work_guide IS NOT NULL AND criteria_revision BETWEEN 1 AND revision
   AND evidence_revision BETWEEN 1 AND revision AND changed_sections IS NOT NULL));

ALTER TABLE theme_production.cases
 ADD COLUMN guide_contract smallint NOT NULL DEFAULT 1 CHECK(guide_contract IN (1,2));
