-- Shared cache contains only fixed, publicly readable original text. Requests
-- are private and disappear with their account; usage survives account deletion.
ALTER TABLE member_knowledge.review_attempts DROP CONSTRAINT review_attempts_purpose_check;
ALTER TABLE member_knowledge.review_attempts ADD CONSTRAINT review_attempts_purpose_check CHECK(purpose IN('submission','evaluation','collection-read','collection-check','collection-evaluation','translation-generate','translation-evaluation'));
CREATE TABLE member_knowledge.translation_generation (
 id text PRIMARY KEY, target jsonb NOT NULL, language text NOT NULL,
 original_text text NOT NULL, original_hash text NOT NULL, source_language text,
 policy text NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','running','retry','quota','ready','attention','cancelled')),
 reason text NOT NULL DEFAULT '', text text, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 next_attempt timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 current_attempt uuid REFERENCES member_knowledge.review_attempts(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX translation_generation_due ON member_knowledge.translation_generation(next_attempt,created_at) WHERE state IN('queued','retry','quota');
CREATE TABLE member_knowledge.translation_generation_requests (
 owner_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 job_id text NOT NULL REFERENCES member_knowledge.translation_generation(id),
 profile_id text NOT NULL, cancelled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,job_id)
);
CREATE TABLE member_knowledge.translation_generation_attempts (
 id uuid PRIMARY KEY REFERENCES member_knowledge.review_attempts(id),
 job_id text NOT NULL REFERENCES member_knowledge.translation_generation(id),
 wire text NOT NULL, wire_digest text NOT NULL, response jsonb
);
