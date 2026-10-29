-- New links can be reconstructed only by the authorized owner endpoint.
-- Existing random-token links remain readable by their unchanged token_hash.
ALTER TABLE member_capsule_share
  ADD COLUMN token_derivation_version smallint
  CHECK (token_derivation_version = 1);
