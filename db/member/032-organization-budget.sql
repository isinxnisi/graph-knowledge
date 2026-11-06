-- Organization uses the same project ledger, never a second free-tier pool.
ALTER TABLE member_knowledge.review_attempts DROP CONSTRAINT review_attempts_purpose_check;
ALTER TABLE member_knowledge.review_attempts ADD CONSTRAINT review_attempts_purpose_check
 CHECK(purpose IN('submission','evaluation','collection-read','collection-check','collection-evaluation','translation-generate','translation-evaluation','organization-propose','organization-check','organization-evaluation'));
