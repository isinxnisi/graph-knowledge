-- Operator-owned raster media only. Amazon images remain remote, expiring provider data.
CREATE TABLE product_image_provenance(id text PRIMARY KEY, content jsonb NOT NULL);
CREATE TABLE product_image_asset(
 id text PRIMARY KEY, provenance_id text NOT NULL REFERENCES product_image_provenance(id),
 role text NOT NULL CHECK(role IN('illustration','product-photo')), alt jsonb NOT NULL,
 width integer NOT NULL CHECK(width>0 AND width<=1600), height integer NOT NULL CHECK(height>0 AND height<=1600),
 bytes bytea NOT NULL CHECK(octet_length(bytes)<=3000000), thumbnail bytea NOT NULL CHECK(octet_length(thumbnail)<=1500000),
 original jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE product_editorial_version(
 id text NOT NULL, revision integer NOT NULL CHECK(revision>0), content jsonb NOT NULL,
 image_id text REFERENCES product_image_asset(id) ON DELETE RESTRICT,
 created_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(id,revision)
);
CREATE TABLE product_editorial_request(
 request_id uuid PRIMARY KEY, owner_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 digest text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX product_image_unused ON product_image_asset(created_at);
CREATE TABLE product_asset_maintenance(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),last_run timestamptz NOT NULL);
