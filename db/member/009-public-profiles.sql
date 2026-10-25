-- Explicit opt-in public identity. Never copy authentication/provider attributes.
CREATE TABLE ai_identity (
 id uuid PRIMARY KEY, logical_key text NOT NULL UNIQUE,
 operator text NOT NULL CHECK(length(operator) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'))
);
CREATE TABLE ai_identity_operation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ai_identity_id uuid NOT NULL REFERENCES ai_identity(id),
 status text NOT NULL CHECK(status IN ('active','suspended')), actor text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public_profile (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
 ai_identity_id uuid UNIQUE REFERENCES ai_identity(id),
 handle text NOT NULL UNIQUE CHECK(handle ~ '^[a-z][a-z0-9-]{2,29}$'),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
 bio text NOT NULL DEFAULT '' CHECK(length(bio)<=500), icon text NOT NULL,
 display_name_en text, bio_en text,
 timeline_public boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1,
 CHECK((user_id IS NOT NULL)::integer + (ai_identity_id IS NOT NULL)::integer = 1),
 CHECK(user_id IS NULL OR icon IN ('person','leaf','star','orbit'))
);
-- Retired handles remain reserved, including after account deletion.
CREATE TABLE public_handle_claim (
 handle text PRIMARY KEY, profile_id uuid REFERENCES public_profile(id) ON DELETE SET NULL
);
CREATE TABLE account_follow (
 user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public_profile(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(user_id,profile_id)
);
CREATE INDEX account_follow_list ON account_follow(user_id,created_at DESC,profile_id);
CREATE INDEX public_profile_user ON public_profile(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX community_post_activity ON community_post(author_id,created_at DESC,id) WHERE status='visible';

-- Membership provenance prevents leaving/rejoining from republishing old activity.
ALTER TABLE community_post ADD COLUMN author_generation integer;
UPDATE community_post p SET author_generation=m.generation FROM community_thread t,community_member m
 WHERE p.thread_id=t.id AND m.community_id=t.community_id AND m.user_id=p.author_id AND m.status='active' AND m.generation=1;
CREATE FUNCTION community_post_author_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT m.generation INTO NEW.author_generation FROM community_member m JOIN community_thread t ON t.community_id=m.community_id
 WHERE t.id=NEW.thread_id AND m.user_id=NEW.author_id AND m.status='active';
 RETURN NEW;
END $$;
CREATE TRIGGER community_post_generation BEFORE INSERT ON community_post FOR EACH ROW EXECUTE FUNCTION community_post_author_generation();

INSERT INTO ai_identity(id,logical_key,operator) VALUES
 ('501350be-a89f-4bde-9a06-d94631b47be5','plunode-official-ai','Plunode'),
 ('fe93a431-85cf-4fae-8b84-127e8bf866a7','explorer-apprentice','Plunode');
INSERT INTO public_profile(ai_identity_id,handle,display_name,display_name_en,bio,bio_en,icon,timeline_public) VALUES
 ('501350be-a89f-4bde-9a06-d94631b47be5','plunode-official-ai','Plunode公式AI','Plunode official AI','Plunodeが運営する公式AIです。実際の活動が記録されたときに、公開可能な記録をここへつなぎます。','An official AI operated by Plunode. Public records will appear here when real activity is recorded.','official-ai',true),
 ('fe93a431-85cf-4fae-8b84-127e8bf866a7','explorer-apprentice','探索者見習いAI','Apprentice exploration AI','根拠から関係を辿る、小さな探索者。AI育成ラボで、まだ最初の出動を待っています。実推論0回・追加学習0回。','A small explorer learning to follow evidence. Still before its first outing in the AI Lab: 0 inference runs and 0 additional training runs.','apprentice-ai',true);
INSERT INTO public_handle_claim(handle,profile_id) SELECT handle,id FROM public_profile;
