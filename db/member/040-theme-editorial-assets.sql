-- Durable reservations prevent GC during review and preserve every published theme image.
CREATE TABLE theme_editorial_asset_reference(
 request_id uuid NOT NULL REFERENCES knowledge_missions.theme_registrations(request_id) ON DELETE RESTRICT,
 image_id text NOT NULL REFERENCES product_image_asset(id) ON DELETE RESTRICT,
 published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,image_id)
);
CREATE INDEX theme_editorial_asset_lookup ON theme_editorial_asset_reference(image_id);
