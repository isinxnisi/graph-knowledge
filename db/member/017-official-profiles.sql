-- Operator-managed public designation, never an authorization grant.
ALTER TABLE public_profile ADD COLUMN official boolean NOT NULL DEFAULT false;
ALTER TABLE public_profile ADD CONSTRAINT public_profile_official_human CHECK(NOT official OR user_id IS NOT NULL);
CREATE TABLE public_profile_operation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 profile_id uuid REFERENCES public_profile(id) ON DELETE SET NULL,
 actor text NOT NULL, reason text NOT NULL, from_handle text NOT NULL, to_handle text NOT NULL,
 official boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
