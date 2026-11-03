-- Public attribution is separate from private drafts and their erasure lifecycle.
CREATE TABLE member_knowledge.publication_contributors (
 decision_id uuid PRIMARY KEY REFERENCES member_knowledge.publication_decisions(id),
 owner_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
 submission_id uuid REFERENCES member_knowledge.submissions(id) ON DELETE SET NULL,
 submission_revision integer NOT NULL CHECK(submission_revision>0),
 attribution text NOT NULL CHECK(attribution IN ('profile','anonymous')),
 activity_public boolean NOT NULL DEFAULT true,
 record_id text NOT NULL, record_revision integer CHECK(record_revision>0),
 operation text NOT NULL, entity_ids text[] NOT NULL DEFAULT '{}', theme_ids text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
 CHECK(attribution='profile' OR activity_public=false)
);
CREATE INDEX knowledge_contributors_record ON member_knowledge.publication_contributors(record_id,record_revision);
CREATE INDEX knowledge_contributors_owner ON member_knowledge.publication_contributors(owner_id,published_at DESC,decision_id DESC) WHERE activity_public AND published_at IS NOT NULL;
