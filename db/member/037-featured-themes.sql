-- Editorial selection only. Theme contents and publication rights remain in the knowledge store.
CREATE TABLE site_featured_themes (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 revision integer NOT NULL CHECK(revision > 0),
 theme_ids text[] NOT NULL CHECK(cardinality(theme_ids) <= 24 AND array_position(theme_ids,NULL) IS NULL),
 updated_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE site_operation_request DROP CONSTRAINT site_operation_request_target_kind_check;
ALTER TABLE site_operation_request ADD CONSTRAINT site_operation_request_target_kind_check
 CHECK(target_kind IN ('report','account','recovery','homepage'));
