CREATE TABLE site_theme_media (
 theme_id text NOT NULL, theme_revision integer NOT NULL CHECK(theme_revision>0),
 generation integer NOT NULL CHECK(generation>0), slots jsonb NOT NULL CHECK(jsonb_typeof(slots)='array'),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(theme_id,theme_revision)
);
-- Editorial decisions survive removal. YouTube titles, availability and thumbnails are not archived.
CREATE TABLE site_theme_media_receipt (
 request_id uuid PRIMARY KEY, actor text NOT NULL, digest text NOT NULL,
 theme_id text NOT NULL, theme_revision integer NOT NULL, generation integer NOT NULL,
 before_slots jsonb NOT NULL, after_slots jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
