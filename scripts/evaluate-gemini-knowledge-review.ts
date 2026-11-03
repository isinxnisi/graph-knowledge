import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rmdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import {homedir} from "node:os";
import { z } from "zod";
import { callGeminiReview, geminiReviewRequest, parseGeminiReview, GEMINI_REVIEW_POLICY } from "../lib/server/gemini-knowledge-review";
import { knowledgeReviewInputSchema } from "../lib/domain/knowledge-review";

const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const offline = args.includes("--offline");
const retryUnknown = args.includes("--retry-unknown");
const corpus = option("--cases") ?? "data/knowledge-review-cases.json";
if (!["data/knowledge-review-cases.json", "data/knowledge-review-holdout.json"].includes(corpus)) throw new Error("Use an approved synthetic evaluation corpus");
const privateRoot = resolve(".local/u5-gemini");
const output = resolve(option("--output") ?? ".local/u5-gemini/baseline");
if (!output.startsWith(privateRoot + "/")) throw new Error("Keep evaluation responses under the private Gemini directory");
const config = z.strictObject({ projectId: z.string().min(1), billingTier: z.literal("free"), verifiedAt: z.string(), model: z.string().regex(/^gemini-[a-z0-9.-]+$/), rpm: z.number().int().positive().max(15), requestsPerDay: z.number().int().positive().max(100), inputTokensPerDay: z.number().int().positive(), outputTokensPerDay: z.number().int().positive() }).parse(JSON.parse(await readFile(resolve(privateRoot, "config.json"), "utf8")));
if(!offline){
 try{const active=JSON.parse(await readFile(resolve(homedir(),".local/state/plunode-previews/beta-review.json"),"utf8"));if(active.projectId===config.projectId)throw new Error("The project now uses the durable review budget. Legacy live evaluation is disabled; offline replay remains available.");}
 catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
}
const text = await readFile(corpus, "utf8");
const cases = z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), group: z.string(), input: knowledgeReviewInputSchema, expected: z.object({ suitability: z.string(), support: z.string() }) })).min(1).max(60).parse(JSON.parse(text));
if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("Duplicate case IDs");
const limit = Number(option("--limit") ?? cases.length);
if (!Number.isInteger(limit) || limit < 1 || limit > cases.length) throw new Error("Invalid finite evaluation limit");
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const manifest = { projectId: config.projectId, model: config.model, corpus, corpusSha256: digest(text), policy: GEMINI_REVIEW_POLICY, promptSha256: digest(JSON.stringify(geminiReviewRequest(cases[0].input).systemInstruction)) };
await mkdir(output, { recursive: true, mode: 0o700 });
try { if (JSON.stringify(JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"))) !== JSON.stringify(manifest)) throw new Error("Evaluation inputs or policy differ from retained run"); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT" || offline) throw error;
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
}
type Attempt = { day: string; wireSha256: string; state: string; startedAt: string; inputReserved: number; outputReserved: number; inputActual: number | null; outputActual: number | null };
const ledgerPath = resolve(privateRoot, "evaluation-usage.json");
const lockPath = resolve(privateRoot, "evaluation.lock");
let locked = false;
if (!offline) { await mkdir(lockPath, { mode: 0o700 }); locked = true; }
let ledger: { projectId: string; attempts: Record<string, Attempt> };
try { ledger = JSON.parse(await readFile(ledgerPath, "utf8")); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") { if (locked) await rmdir(lockPath); throw error; }
  ledger = { projectId: config.projectId, attempts: {} };
}
if (ledger.projectId !== config.projectId) { if (locked) await rmdir(lockPath); throw new Error("Usage ledger belongs to a different project"); }
const persistLedger = async () => { await writeFile(ledgerPath + ".tmp", JSON.stringify(ledger, null, 2), { mode: 0o600 }); await rename(ledgerPath + ".tmp", ledgerPath); };
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
let key = "";
const results: Record<string, unknown>[] = [];
let consecutiveTransportFailures = 0;
try {
  if (!offline) key = (await readFile(resolve(privateRoot, "api-key"), "utf8")).trim();
  for (const test of cases.slice(0, limit)) {
    const request = geminiReviewRequest(test.input), wire = JSON.stringify(request), wireSha256 = digest(wire);
    let attempt = 1;
    const firstPath = resolve(output, test.id + ".json"), retryPath = resolve(output, test.id + ".attempt-2.json");
    try { await access(retryPath); attempt = 2; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (retryUnknown && !offline) {
        try {
          const first = JSON.parse(await readFile(firstPath, "utf8"));
          if (first.state === "delivery-unknown" && Date.now() - Date.parse(first.startedAt) >= 120_000) attempt = 2;
        } catch (error) {
          // An interrupted corpus may still contain cases that have never been
          // sent. Retry mode does not turn their first send into a retry.
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    }
    const casePath = attempt === 1 ? firstPath : retryPath;
    const attemptId = digest(JSON.stringify(attempt === 1 ? [output, test.id, wireSha256] : [output, test.id, wireSha256, attempt]));
    let entry: Record<string, unknown>;
    let sentNow = false;
    try {
      entry = JSON.parse(await readFile(casePath, "utf8"));
      if (entry.wireSha256 !== wireSha256) throw new Error("Retained attempt has a different input; do not resend");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (offline || ledger.attempts[attemptId]) throw new Error("Missing result or unresolved prior send; automatic inference retry is disabled");
      const attempts = Object.values(ledger.attempts);
      const last = Math.max(0, ...attempts.map(a => Date.parse(a.startedAt)));
      const waitMs = Math.max(0, last + Math.ceil(60_000 / Math.min(config.rpm, 12)) + 100 - Date.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      const today = day(), current = attempts.filter(a => a.day === today);
      // A conservative reservation for this bounded text-only evaluation, not a
      // claim that estimates equal the provider's actual tokenizer counts.
      const inputReserved = Buffer.byteLength(wire) + 1024, outputReserved = request.generationConfig.maxOutputTokens;
      if (current.length >= config.requestsPerDay || current.reduce((n, a) => n + (a.inputActual ?? a.inputReserved), 0) + inputReserved > config.inputTokensPerDay || current.reduce((n, a) => n + (a.outputActual ?? a.outputReserved), 0) + outputReserved > config.outputTokensPerDay) throw new Error("Evaluation allowance exhausted; keep results and wait for the next provider day");
      ledger.attempts[attemptId] = { day: today, wireSha256, state: "reserved", startedAt: new Date().toISOString(), inputReserved, outputReserved, inputActual: null, outputActual: null };
      await persistLedger();
      entry = { id: test.id, model: config.model, policy: GEMINI_REVIEW_POLICY, wireSha256, wire, attemptId, attempt, state: "sending", startedAt: ledger.attempts[attemptId].startedAt };
      await writeFile(casePath, JSON.stringify(entry, null, 2), { flag: "wx", mode: 0o600 });
      const start = performance.now();
      sentNow = true;
      const response = await callGeminiReview({ apiKey: key, model: config.model, request });
      entry = { ...entry, ...response, durationMs: Math.round(performance.now() - start) };
      await writeFile(casePath, JSON.stringify(entry, null, 2).replaceAll(key, "[redacted]"), { mode: 0o600 });
      ledger.attempts[attemptId].state = response.state;
      if (response.state === "received") {
        const usage = parseGeminiReview(response.raw).usage;
        ledger.attempts[attemptId].inputActual = usage.promptTokenCount;
        ledger.attempts[attemptId].outputActual = usage.candidatesTokenCount === null || usage.thoughtsTokenCount === null ? null : usage.candidatesTokenCount + usage.thoughtsTokenCount;
      }
      await persistLedger();
    }
    if (entry.state !== "received") {
      const result = { id: test.id, group: test.group, expected: test.expected, state: entry.state, status: entry.status ?? null, durationMs: entry.durationMs, wireSha256, attempt };
      results.push(result); console.log(JSON.stringify(result));
      // Preserve this unresolved attempt and continue independent cases. A burst
      // of failures opens the circuit; quota/auth/request errors stop new calls.
      if (sentNow) consecutiveTransportFailures++;
      if (!offline && sentNow && (entry.state === "http-error" || consecutiveTransportFailures >= 2)) break;
      continue;
    }
    consecutiveTransportFailures = 0;
    const parsed = parseGeminiReview(entry.raw);
    const result = { id: test.id, group: test.group, expected: test.expected, ...parsed, durationMs: entry.durationMs, wireSha256, attempt };
    results.push(result);
    console.log(JSON.stringify({ id: test.id, state: parsed.state, ...(parsed.state === "reviewed" ? { suitability: parsed.review.suitability, support: parsed.review.support } : {}) }));
  }
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ ...manifest, cases: results, complete: results.length === cases.length, requestsInCorpus: results.length }, null, 2), { mode: 0o600 });
} finally {
  key = "";
  if (locked) await rmdir(lockPath);
}
