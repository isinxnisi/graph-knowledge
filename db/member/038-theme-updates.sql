-- Retain every creation/update request; many immutable requests may address
-- the same editorial Theme. Existing rows, owners, hashes and receipts survive.
ALTER TABLE knowledge_missions.theme_registrations
 DROP CONSTRAINT theme_registrations_theme_id_key;
CREATE INDEX theme_registration_target ON knowledge_missions.theme_registrations(theme_id,created_at DESC);
