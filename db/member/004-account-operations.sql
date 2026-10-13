-- 会員の停止・退会と限定共有の運営停止。KGには触れない。
ALTER TABLE member_capsule ADD COLUMN sharing_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE member_capsule_post ADD COLUMN hidden_at timestamptz;
CREATE TABLE member_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('suspend-user', 'resume-user', 'block-sharing', 'hide-post', 'delete-account')),
  target_id uuid NOT NULL,
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 80),
  reason text NOT NULL CHECK (reason IN ('abuse', 'security', 'request', 'correction')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- session生成hookの確認後に停止が競合しても、無効なsessionを作らない。
CREATE FUNCTION member_require_active_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "user" WHERE id = NEW."userId" AND active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inactive member' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER member_active_session BEFORE INSERT ON "session"
FOR EACH ROW EXECUTE FUNCTION member_require_active_session();
