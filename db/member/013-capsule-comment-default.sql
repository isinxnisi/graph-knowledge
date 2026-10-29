-- New shared Capsules accept comments from already-authorized members.
-- Preserve existing explicit closure choices and all conversation records.
ALTER TABLE member_capsule_thread ALTER COLUMN closed SET DEFAULT false;
