import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

// Explicit additive migrations, pinned in Git. Never run during requests or
// execute generated SQL from a newly upgraded auth dependency without review.
export async function migrateMemberDatabase(pool: Pool, communities = false, siteOperations = false, publicProfiles = false, capsuleDocuments = false, communityCapsules = false, capsuleComments = false, capsuleShareRecovery = false, capsulePublications = false, googleProfileImages = false, officialProfiles = false, capsuleTrash = false, capsulePostReports = false, knowledgeSubmissions = false, knowledgeReviewJobs = false, knowledgeAcceptance = false, knowledgeContexts = false, knowledgeFeedback = false, knowledgeContributors = false, knowledgeAppeals = false, knowledgeCollection = false, collectionReading = false, translationGeneration = false, knowledgeImport = false, knowledgeOrganization = false, knowledgeMissions = false, missionOAuth = false, themeRegistration = false, featuredThemes = false, themeUpdates = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(71900261)");
    await client.query("CREATE TABLE IF NOT EXISTS member_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    if(themeUpdates&&!themeRegistration)throw new Error("Theme updates require theme registration migrations");
    if(featuredThemes&&!siteOperations)throw new Error("Featured themes require site operations");
    if(siteOperations&&!communities)throw new Error("Site operations require community migrations");
    if(publicProfiles&&(!communities||!siteOperations))throw new Error("Public profiles require migrations 000-008");
    if (communityCapsules && (!communities || !capsuleDocuments)) throw new Error("Community Capsules require community and document migrations");
    if (capsulePublications && !capsuleShareRecovery) throw new Error("Capsule publications require share recovery migration");
    if (googleProfileImages && !publicProfiles) throw new Error("Google profile images require public profile migrations");
    if (officialProfiles && !publicProfiles) throw new Error("Official profiles require public profile migrations");
    if (capsulePostReports && (!communityCapsules || !capsulePublications || !capsuleTrash)) throw new Error("Capsule post reports require community Capsules, publications and trash migrations");
    if (knowledgeMissions && !knowledgeOrganization) throw new Error("Missions require the existing import and organization migrations");
    if (themeRegistration && !knowledgeMissions) throw new Error("Theme registration requires mission/import migrations");
    if (missionOAuth && !knowledgeMissions) throw new Error('Collection OAuth requires mission migrations');
    if (knowledgeOrganization && !knowledgeImport) throw new Error("Organization requires the existing shared AI migrations");
    if (knowledgeImport && !translationGeneration) throw new Error("Knowledge import requires existing AI and translation migrations");
    if (translationGeneration && !collectionReading) throw new Error("Translation generation requires existing AI usage migrations");
    if (collectionReading && (!knowledgeCollection || !knowledgeReviewJobs)) throw new Error("Collection reading requires capture and AI usage");
    if (knowledgeCollection && !siteOperations) throw new Error("Knowledge collection requires site operations");
    if (knowledgeAppeals && (!knowledgeFeedback || !siteOperations || !knowledgeContributors)) throw new Error("Knowledge appeals require feedback, contributors and site operations");
    if (knowledgeContributors && (!knowledgeAcceptance || !publicProfiles || !knowledgeContexts)) throw new Error("Knowledge contributors require acceptance, contexts and public profiles");
    if (knowledgeFeedback && !knowledgeAcceptance) throw new Error("Knowledge feedback requires acceptance");
    if (knowledgeContexts && !knowledgeSubmissions) throw new Error("Knowledge contexts require submissions");
    if (knowledgeAcceptance && !knowledgeReviewJobs) throw new Error("Knowledge acceptance requires review jobs");
    if (knowledgeReviewJobs && !knowledgeSubmissions) throw new Error("Knowledge review jobs require submission migrations");
    for (const name of ["000-auth.sql", "001-capsules.sql", "002-capsule-sharing.sql", "003-capsule-discussion.sql", "004-account-operations.sql", ...(communities ? ["005-communities.sql", "006-community-continuity.sql", "007-community-safety.sql"] : []), ...(siteOperations ? ["008-site-operations.sql"] : []), ...(publicProfiles ? ["009-public-profiles.sql", "010-account-initial-experience.sql"] : []), ...(capsuleDocuments ? ["011-capsule-documents.sql"] : []), ...(communityCapsules ? ["012-community-capsules.sql"] : []), ...(capsuleComments ? ["013-capsule-comment-default.sql"] : []), ...(capsuleShareRecovery ? ["014-capsule-share-recovery.sql"] : []), ...(capsulePublications ? ["015-capsule-publications.sql"] : []), ...(googleProfileImages ? ["016-google-profile-images.sql"] : []), ...(officialProfiles ? ["017-official-profiles.sql"] : []), ...(capsuleTrash ? ["018-capsule-trash.sql"] : []), ...(capsulePostReports ? ["019-capsule-post-reports.sql"] : []), ...(knowledgeSubmissions ? ["020-knowledge-submissions.sql"] : []), ...(knowledgeReviewJobs ? ["021-knowledge-review-jobs.sql"] : []), ...(knowledgeAcceptance ? ["022-knowledge-acceptance.sql"] : []), ...(knowledgeContexts ? ["023-knowledge-submission-contexts.sql"] : []), ...(knowledgeFeedback ? ["024-knowledge-submission-feedback.sql"] : []), ...(knowledgeContributors ? ["025-knowledge-contributors.sql"] : []), ...(knowledgeAppeals ? ["026-knowledge-appeals.sql"] : []), ...(knowledgeCollection ? ["027-knowledge-collection.sql"] : []), ...(collectionReading ? ["028-collection-reading.sql"] : []), ...(translationGeneration ? ["029-translation-generation.sql"] : []), ...(knowledgeImport ? ["030-knowledge-import.sql"] : []), ...(translationGeneration ? ["031-translation-context.sql"] : []), ...(knowledgeOrganization ? ["032-organization-budget.sql"] : []), ...(knowledgeMissions ? ["033-knowledge-missions.sql", "034-knowledge-mission-updates.sql"] : []), ...(missionOAuth ? ["035-mission-oauth.sql"] : []), ...(themeRegistration ? ["036-theme-registration.sql"] : []), ...(featuredThemes ? ["037-featured-themes.sql"] : []), ...(themeUpdates ? ["038-theme-updates.sql"] : [])]) {
      const sql = await readFile(new URL(`../../../db/member/${name}`, import.meta.url), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM member_migration WHERE name = $1", [name]);
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) throw new Error("Applied member migration has changed");
      } else {
        await client.query(sql);
        await client.query("INSERT INTO member_migration (name, checksum) VALUES ($1, $2)", [name, checksum]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
