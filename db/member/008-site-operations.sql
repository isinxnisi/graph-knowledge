-- Web operator receipts and minimal audit. No private body, email, session or credential snapshot.
CREATE TABLE site_operation_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operator_id uuid NOT NULL,
 request_id uuid NOT NULL,
 payload_hash text NOT NULL,
 action text NOT NULL,
 target_kind text NOT NULL CHECK(target_kind IN ('report','account','recovery')),
 target_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operator_id,request_id)
);
CREATE INDEX site_operation_history ON site_operation_request(created_at,id);
CREATE INDEX site_operation_target ON site_operation_request(target_id,created_at,id);