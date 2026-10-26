// This edits only this checkout's vocabulary after a hash-bound human decision.
// It does not accept Claims, install a gate, sign a request, or publish a release.
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { prepareFilmRoleDecision, registerFilmRoles } from "../lib/domain/film-role-registration";
const args = process.argv.slice(2);
const files = ["vocabulary/contribution-roles/catalog.json", "vocabulary/contribution-roles/baseline-v1.json",
  "vocabulary/contribution-roles/reviews.json", "vocabulary/contribution-roles/film-pending.json",
  "docs/research/film-beta-issue43/role-review-drafts.json"];
const raw = await Promise.all(files.map(file => readFile(file, "utf8")));
const [catalog, baseline, reviews, pending, draftObject] = raw.map(text => JSON.parse(text));
const drafts = Array.isArray(draftObject) ? draftObject : draftObject.reviews;
if (args.length === 2 && args[0] === "--prepare") {
  await writeFile(args[1], JSON.stringify(prepareFilmRoleDecision(catalog, reviews, pending, drafts), null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: "draft-not-approved", file: args[1] }));
} else if (args.length === 4 && args[0] === "--apply" && args[2] === "--sha") {
  const decisionText = await readFile(args[1], "utf8");
  if (createHash("sha256").update(decisionText).digest("hex") !== args[3]) throw Error("Human decision file SHA mismatch");
  const next = registerFilmRoles(JSON.parse(decisionText), catalog, baseline, reviews, pending, drafts);
  const targets = [files[0], files[2]], contents = [next.catalog, next.reviews];
  const suffix = ".film-registration-" + process.pid;
  try {
    for (let i = 0; i < targets.length; i++) await writeFile(targets[i] + suffix, JSON.stringify(contents[i], null, 2) + "\n", { flag: "wx" });
    // Check again after validation; a concurrent change cannot be silently overwritten.
    for (let i = 0; i < files.length; i++) if (await readFile(files[i], "utf8") !== raw[i]) throw Error("Vocabulary changed during registration");
    await rename(targets[0] + suffix, targets[0]);
    try { await rename(targets[1] + suffix, targets[1]); }
    catch (error) { await writeFile(targets[0], raw[0]); throw error; }
  } finally {
    for (const target of targets) await unlink(target + suffix).catch(() => {});
  }
  console.log(JSON.stringify({ status: "registered-in-checkout-only", roles: ["DIRECTING", "ACTING"], publicApply: false }));
} else throw Error("Usage: register-film-roles.ts --prepare <new-draft.json> | --apply <human-decision.json> --sha <sha256>");
