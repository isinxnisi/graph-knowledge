-- Reversible removal. Contents and conversation history remain intact.
ALTER TABLE member_capsule ADD COLUMN trashed_at timestamptz;
CREATE INDEX member_capsule_active_owner ON member_capsule(owner_user_id,dataset) WHERE trashed_at IS NULL;
