-- Private, receipt-item-bound exceptions. Explicitly shared with site operators.
CREATE TABLE member_knowledge.appeals (
 id uuid PRIMARY KEY, job_id uuid NOT NULL UNIQUE REFERENCES member_knowledge.review_jobs(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, payload_hash text NOT NULL, snapshot jsonb NOT NULL, detail text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','withdrawn')),
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX knowledge_appeals_queue ON member_knowledge.appeals(status,created_at,id);
CREATE TABLE member_knowledge.appeal_operations (
 id uuid PRIMARY KEY, appeal_id uuid NOT NULL REFERENCES member_knowledge.appeals(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES "user"(id) ON DELETE SET NULL, request_id uuid NOT NULL,
 payload_hash text NOT NULL, action text NOT NULL, reason text NOT NULL,
 public_reply boolean NOT NULL DEFAULT false, result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,request_id), UNIQUE(appeal_id,request_id,action)
);
-- Accepted public visibility work survives private account/submission erasure.
CREATE TABLE member_knowledge.moderation_decisions (
 id uuid PRIMARY KEY, appeal_id uuid REFERENCES member_knowledge.appeals(id) ON DELETE SET NULL,
 command jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','blocked')),
 result jsonb, notified_at timestamptz, reason text NOT NULL DEFAULT '', not_before timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_moderation_due ON member_knowledge.moderation_decisions(state,not_before);
ALTER TABLE member_knowledge.review_jobs ADD COLUMN operator_confirmation_id uuid REFERENCES member_knowledge.appeal_operations(id) ON DELETE SET NULL;
