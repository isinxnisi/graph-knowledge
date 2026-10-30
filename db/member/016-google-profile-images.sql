-- User-authorized default switch for existing human accounts, once only.
ALTER TABLE public_profile DROP CONSTRAINT public_profile_check1;
ALTER TABLE public_profile ADD CONSTRAINT public_profile_human_icon
 CHECK(user_id IS NULL OR icon IN ('google','person','leaf','star','orbit'));
ALTER TABLE public_profile ALTER COLUMN icon SET DEFAULT 'google';
UPDATE public_profile SET icon='google', revision=revision+1
 WHERE user_id IS NOT NULL AND icon<>'google';

CREATE OR REPLACE FUNCTION member_prepare_public_profile(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
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
  VALUES(uid,public_id,display,'google',true) RETURNING id INTO prepared_id;
 UPDATE public_handle_claim SET profile_id=prepared_id WHERE handle=public_id;
END $$;
