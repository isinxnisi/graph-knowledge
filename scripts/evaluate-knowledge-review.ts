import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { knowledgeReviewRequest, parseKnowledgeReview, knowledgeReviewBinaryRequest, parseKnowledgeReviewBinary, type KnowledgeReviewInput, type ReviewAxis } from "../lib/domain/knowledge-review";

type Case = { id: string; group: string; input: KnowledgeReviewInput; expected: Record<ReviewAxis, string> };
const args = process.argv.slice(2);
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const profile = option("--profile") ?? "categorical-v1";
if (!["categorical-v1", "binary-v2"].includes(profile)) throw new Error("Unknown review profile");
const offline = args.includes("--offline");
const output = resolve(option("--output") ?? ".local/u5-review-evaluation");
const endpoint = new URL(option("--endpoint") ?? "http://127.0.0.1:8009/v1/systemone");
// This evaluation never enables a paid provider or sends user/private material.
if (!["http://127.0.0.1:8009", "http://127.0.0.1:8010"].includes(endpoint.origin) || endpoint.pathname !== "/v1/systemone" || endpoint.search || endpoint.username || endpoint.password) throw new Error("Use an existing loopback Kev API");
const cases: Case[] = JSON.parse(await readFile(new URL("../data/knowledge-review-cases.json", import.meta.url), "utf8"));
if (!cases.length || cases.length > 32 || new Set(cases.map(c => c.id)).size !== cases.length) throw new Error("Invalid bounded evaluation corpus");
await mkdir(output, { recursive: true, mode: 0o700 });
const runtimePath = resolve(output, "runtime.json");
let runtime: Record<string, unknown>;
try { runtime = JSON.parse(await readFile(runtimePath, "utf8")); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT" || offline) throw error;
  runtime = await fetch(new URL("/v1/runtime", endpoint), { signal: AbortSignal.timeout(10_000) }).then(r => { if (!r.ok) throw new Error(`runtime ${r.status}`); return r.json(); });
  await writeFile(runtimePath, JSON.stringify(runtime, null, 2), { mode: 0o600, flag: "wx" });
}
const identityKeys = ["run", "model_revision", "base_revision", "kev_commit", "device", "dtype"];
if (!offline) {
  const observed = await fetch(new URL("/v1/runtime", endpoint), { signal: AbortSignal.timeout(10_000) }).then(r => { if (!r.ok) throw new Error(`runtime ${r.status}`); return r.json(); });
  if (identityKeys.some(key => observed[key] !== runtime[key])) throw new Error("Runtime differs from this output directory; use --offline to score retained results");
}
const results: Record<string, unknown>[] = [];
for (const test of cases) {
  const wire = JSON.stringify(profile === "binary-v2" ? knowledgeReviewBinaryRequest(test.input) : knowledgeReviewRequest(test.input));
  const sha256 = createHash("sha256").update(wire).digest("hex");
  const path = resolve(output, test.id + ".json");
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(await readFile(path, "utf8"));
    if (entry.sha256 !== sha256 || !entry.response) throw new Error("Existing attempt differs or has uncertain delivery; inspect it before creating another evaluation directory");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (offline) throw new Error("Offline scoring requires every retained response; no inference is sent");
    entry = { id: test.id, group: test.group, expected: test.expected, sha256, wire, startedAt: new Date().toISOString(), state: "sending" };
    // Persist before the one inference attempt. A crash/timeout is not retried.
    await writeFile(path, JSON.stringify(entry, null, 2), { flag: "wx", mode: 0o600 });
    const start = performance.now();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: wire, signal: AbortSignal.timeout(120_000) });
      const body = await response.json();
      entry = { ...entry, state: response.ok ? "received" : "http-error", status: response.status, response: body, durationMs: Math.round(performance.now() - start) };
    } catch (error) {
      entry = { ...entry, state: "delivery-unknown", error: String(error), durationMs: Math.round(performance.now() - start) };
    }
    await writeFile(path, JSON.stringify(entry, null, 2), { mode: 0o600 });
  }
  if (entry.state !== "received") { console.log(JSON.stringify({ id: test.id, state: entry.state })); throw new Error("Evaluation stopped; no automatic inference retry"); }
  const parsed = profile === "binary-v2" ? parseKnowledgeReviewBinary(entry.response) : parseKnowledgeReview(entry.response);
  if (identityKeys.some(key => parsed.runtime[key] !== runtime[key])) throw new Error("Response runtime differs from the recorded model");
  const expected = profile === "binary-v2" ? { ...test.expected, support: test.expected.support === "supported" ? "supported" : "unsupported" } : test.expected;
  const result = { id: test.id, group: test.group, expected, observed: { suitability: parsed.suitability, support: parsed.support }, durationMs: entry.durationMs, usage: (entry.response as { usage?: unknown }).usage ?? null };
  results.push(result);
  console.log(JSON.stringify(result));
}
const summary = { profile, runtime, cases: results, requests: results.length, note: "Synthetic screening evaluation; not evidence of real-world factual accuracy. Probabilities are model choices, not accuracy. Usage is the local service's reported counters; not paid API billing." };
await writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
