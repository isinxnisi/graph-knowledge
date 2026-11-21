-- Preserve existing IDs and allow Better Auth to store its stable replay key.
ALTER TABLE mission_oauth_client_assertion
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT (pg_catalog.gen_random_uuid()::text);
