-- Keep scheduled work sequential without excluding independent operator chats.
-- Existing cases keep their exact IDs, content, leases, history and scheduled selection.
ALTER TABLE theme_production.cases ADD COLUMN workflow text NOT NULL DEFAULT 'scheduled' CHECK(workflow IN('scheduled','manual'));
DROP INDEX theme_production.theme_production_one_active;
CREATE UNIQUE INDEX theme_production_one_scheduled_active ON theme_production.cases(owner_id,environment) WHERE status<>'completed' AND workflow='scheduled';
CREATE UNIQUE INDEX theme_production_one_active_theme ON theme_production.cases(owner_id,environment,theme_id) WHERE status<>'completed' AND theme_id IS NOT NULL;
CREATE INDEX theme_production_current_workflow ON theme_production.cases(owner_id,environment,origin,workflow,created_at DESC);
