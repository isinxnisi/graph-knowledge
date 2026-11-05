-- Preserve old requests and usage. v1 drafts are never reused as v2 context.
ALTER TABLE member_knowledge.translation_generation
 ADD COLUMN context jsonb,
 ADD COLUMN context_hash text;
ALTER TABLE member_knowledge.translation_generation ADD CONSTRAINT translation_generation_context_check
 CHECK ((context IS NULL AND context_hash IS NULL) OR
 (context IS NOT NULL AND jsonb_typeof(context)='object' AND context_hash ~ '^[a-f0-9]{64}$'));
