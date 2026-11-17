-- Editorial publication is independent of common-knowledge visibility/phase.
CREATE TABLE knowledge75.theme_publications (
 theme_id text PRIMARY KEY, published_revision integer CHECK(published_revision>0),
 release_id text,draft_updated_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE knowledge75.theme_releases (
 theme_id text NOT NULL REFERENCES knowledge75.theme_publications(theme_id),revision integer NOT NULL CHECK(revision>0),
 release_id text UNIQUE,proof jsonb,theme_translations jsonb,image_ids jsonb NOT NULL DEFAULT '[]',
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(theme_id,revision)
);
INSERT INTO knowledge75.theme_publications(theme_id,published_revision)
 SELECT o.id,CASE WHEN o.visibility='public' AND p.id IS NOT NULL AND o.id<>'theme:1ab040a3a68b1e5666de0ba354fa484891d56e95d5e6bda3' THEN o.current_revision END
 FROM knowledge75.objects o LEFT JOIN knowledge75.published_revisions p ON p.kind=o.kind AND p.id=o.id AND p.revision=o.current_revision WHERE o.kind='theme';
INSERT INTO knowledge75.theme_releases(theme_id,revision,approved_at,image_ids)
 SELECT p.id,p.revision,r.created_at,COALESCE((SELECT jsonb_agg(DISTINCT entry->'image'->>'id') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.content->'reading')='array' THEN r.content->'reading' ELSE '[]'::jsonb END) entry WHERE entry->'image'->>'id' IS NOT NULL),'[]') FROM knowledge75.published_revisions p JOIN knowledge75.theme_publications h ON h.theme_id=p.id AND h.published_revision IS NOT NULL
 JOIN knowledge75.revisions r ON r.kind=p.kind AND r.id=p.id AND r.revision=p.revision WHERE p.kind='theme';
CREATE FUNCTION knowledge75.new_theme_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.kind='theme' THEN INSERT INTO knowledge75.theme_publications(theme_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;END IF;RETURN NEW;END $$;
CREATE TRIGGER knowledge_new_theme_draft AFTER INSERT ON knowledge75.objects FOR EACH ROW EXECUTE FUNCTION knowledge75.new_theme_draft();
CREATE INDEX knowledge_theme_release_images ON knowledge75.theme_releases USING gin(image_ids);

-- Append-only approvals retain exact translation/Capsule pins across later approvals
-- of the same Theme edition (translation versions are independent).
CREATE TABLE knowledge75.theme_release_approvals (
 release_id text PRIMARY KEY,theme_id text NOT NULL,revision integer NOT NULL,
 proof jsonb,theme_translations jsonb NOT NULL,image_ids jsonb NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(theme_id,revision) REFERENCES knowledge75.theme_releases(theme_id,revision)
);
CREATE FUNCTION knowledge75.immutable_theme_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Theme approval history is immutable';END $$;
CREATE TRIGGER knowledge_immutable_theme_approval BEFORE UPDATE OR DELETE ON knowledge75.theme_release_approvals FOR EACH ROW EXECUTE FUNCTION knowledge75.immutable_theme_approval();
