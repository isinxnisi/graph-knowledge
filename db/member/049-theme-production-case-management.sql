ALTER TABLE theme_production.cases
 ADD COLUMN abandon_reason text,
 DROP CONSTRAINT cases_status_check,
 ADD CHECK (status IN ('ready','working','waiting-publication','blocked','completed','abandoned')),
 ADD CHECK ((status='abandoned')=(abandon_reason IS NOT NULL)),
 ADD CHECK (status<>'abandoned' OR execution_id IS NULL);

DROP INDEX theme_production.theme_production_one_scheduled_active;
DROP INDEX theme_production.theme_production_one_active_theme;
CREATE UNIQUE INDEX theme_production_one_scheduled_active
 ON theme_production.cases(owner_id,environment) WHERE status NOT IN ('completed','abandoned') AND workflow='scheduled';
CREATE UNIQUE INDEX theme_production_one_active_theme
 ON theme_production.cases(owner_id,environment,theme_id) WHERE status NOT IN ('completed','abandoned') AND theme_id IS NOT NULL;
CREATE INDEX theme_production_case_history
 ON theme_production.cases(owner_id,environment,origin,theme_id,created_at DESC,id DESC);
CREATE INDEX theme_production_operation_history
 ON theme_production.operations(case_id,owner_id,created_at DESC,request_id DESC);

-- The image retention triggers intentionally continue to retain materials referenced by abandoned cases.
