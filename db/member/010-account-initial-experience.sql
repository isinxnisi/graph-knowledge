-- Issue #39 initial-experience correction. 000-009 remain immutable.
-- A saved profile wins over the old, independently edited authentication name.
UPDATE "user" u SET name=p.display_name FROM public_profile p WHERE p.user_id=u.id AND u.name IS DISTINCT FROM p.display_name;

CREATE FUNCTION member_initial_display_name(candidate text, email text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 IF candidate IS NOT NULL AND length(btrim(candidate)) BETWEEN 1 AND 80
    AND candidate !~ '[[:cntrl:]]' AND candidate !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    AND lower(btrim(candidate)) IS DISTINCT FROM lower(email) THEN RETURN btrim(candidate); END IF;
 RETURN 'Explorer ' || substr(replace(gen_random_uuid()::text,'-',''),1,12);
END $$;
UPDATE "user" u SET name=member_initial_display_name(u.name,u.email)
 WHERE NOT EXISTS(SELECT 1 FROM public_profile p WHERE p.user_id=u.id);
ALTER TABLE public_profile ALTER COLUMN timeline_public SET DEFAULT true;

CREATE FUNCTION member_prepare_public_profile(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE public_id text; prepared_id uuid; display text;
BEGIN
 SELECT name INTO display FROM "user" WHERE id=uid FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public_profile WHERE user_id=uid) THEN RETURN; END IF;
 LOOP
  -- Independent randomness, never a transformation of user/provider IDs or email.
  public_id := 'member-' || substr(replace(gen_random_uuid()::text,'-',''),1,16);
  INSERT INTO public_handle_claim(handle) VALUES(public_id) ON CONFLICT DO NOTHING;
  EXIT WHEN FOUND;
 END LOOP;
 INSERT INTO public_profile(user_id,handle,display_name,icon,timeline_public)
  VALUES(uid,public_id,display,'person',true) RETURNING id INTO prepared_id;
 UPDATE public_handle_claim SET profile_id=prepared_id WHERE handle=public_id;
END $$;
SELECT member_prepare_public_profile(id) FROM "user" ORDER BY id;

-- One logical display name. Both existing APIs are compatible, and revision
-- changes invalidate an editor opened before an update through the other API.
CREATE FUNCTION member_validate_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.name := member_initial_display_name(NEW.name,NEW.email);
 ELSIF length(btrim(NEW.name)) NOT BETWEEN 1 AND 80 OR NEW.name ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'invalid display name' USING ERRCODE='23514';
 ELSE NEW.name := btrim(NEW.name); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_name_validate BEFORE INSERT OR UPDATE OF name ON "user" FOR EACH ROW EXECUTE FUNCTION member_validate_name();
CREATE FUNCTION member_sync_profile_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN PERFORM member_prepare_public_profile(NEW.id);
 ELSE UPDATE public_profile SET display_name=NEW.name,revision=revision+1 WHERE user_id=NEW.id AND display_name IS DISTINCT FROM NEW.name; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_profile_name AFTER INSERT OR UPDATE OF name ON "user" FOR EACH ROW EXECUTE FUNCTION member_sync_profile_name();
CREATE FUNCTION public_profile_sync_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF length(btrim(NEW.display_name)) NOT BETWEEN 1 AND 80 OR NEW.display_name ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'invalid display name' USING ERRCODE='23514'; END IF;
 UPDATE "user" SET name=NEW.display_name,"updatedAt"=clock_timestamp() WHERE id=NEW.user_id AND name IS DISTINCT FROM NEW.display_name;
 RETURN NEW;
END $$;
CREATE TRIGGER public_profile_name AFTER INSERT OR UPDATE OF display_name ON public_profile FOR EACH ROW EXECUTE FUNCTION public_profile_sync_name();

-- Source-local provenance, not a duplicate activity/content store. Old sources
-- have unknown historical public boundaries and deliberately remain excluded.
ALTER TABLE community ADD COLUMN activity_public boolean NOT NULL DEFAULT false;
ALTER TABLE community ADD COLUMN creator_generation integer;
ALTER TABLE community_thread ADD COLUMN activity_public boolean NOT NULL DEFAULT false;
ALTER TABLE community_thread ADD COLUMN author_generation integer;
-- Retain the original reference after deletion so a later reply cannot replace it.
ALTER TABLE community_thread ADD COLUMN opening_post_id uuid;
ALTER TABLE community_post ADD COLUMN activity_public boolean NOT NULL DEFAULT false;
CREATE FUNCTION community_activity_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.activity_public := NEW.visibility='public'; NEW.creator_generation := 1;
 ELSIF NEW.visibility<>'public' THEN NEW.activity_public := false; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_activity BEFORE INSERT OR UPDATE OF visibility ON community FOR EACH ROW EXECUTE FUNCTION community_activity_boundary();
CREATE FUNCTION community_activity_revoke() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.visibility<>'public' THEN UPDATE community_thread SET activity_public=false WHERE community_id=NEW.id AND activity_public; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_activity_revoke AFTER UPDATE OF visibility ON community FOR EACH ROW EXECUTE FUNCTION community_activity_revoke();
CREATE FUNCTION thread_activity_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT (c.visibility='public' AND c.status<>'suspended' AND NEW.audience='public'),m.generation
   INTO NEW.activity_public,NEW.author_generation FROM community c JOIN community_member m ON m.community_id=c.id
   WHERE c.id=NEW.community_id AND m.user_id=NEW.author_id AND m.status='active';
  NEW.activity_public := coalesce(NEW.activity_public,false);
 ELSIF NEW.audience<>'public' THEN NEW.activity_public := false; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER thread_activity BEFORE INSERT OR UPDATE OF audience ON community_thread FOR EACH ROW EXECUTE FUNCTION thread_activity_boundary();
CREATE FUNCTION post_activity_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT t.activity_public AND t.audience='public' AND c.visibility='public' AND c.status<>'suspended'
  INTO NEW.activity_public FROM community_thread t JOIN community c ON c.id=t.community_id WHERE t.id=NEW.thread_id;
 NEW.activity_public := coalesce(NEW.activity_public,false);
 RETURN NEW;
END $$;
CREATE TRIGGER post_activity BEFORE INSERT ON community_post FOR EACH ROW EXECUTE FUNCTION post_activity_boundary();
CREATE FUNCTION thread_opening_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE community_thread SET opening_post_id=NEW.id WHERE id=NEW.thread_id AND opening_post_id IS NULL
  AND activity_public AND author_id=NEW.author_id AND NOT EXISTS(SELECT 1 FROM community_post p WHERE p.thread_id=NEW.thread_id AND p.id<>NEW.id);
 RETURN NEW;
END $$;
CREATE TRIGGER thread_opening_post AFTER INSERT ON community_post FOR EACH ROW EXECUTE FUNCTION thread_opening_post();
