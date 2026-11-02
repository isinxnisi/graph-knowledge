/** Observe once, review a reproducible plan, then apply ordinary common APIs.
 * This CLI is deliberately restricted to the independent localhost:3276 preview.
 * Plan:  ... --theme ID --namespace u3 --plan FILE [--bindings JSON_FILE]
 * Apply: ... --apply FILE --token AUTOPILOT_HOLD_TOKEN
 * A failed apply can resume the SAME plan; every command has a stable receipt ID.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { prepareThemeKnowledgeImport, themeKnowledgeImportOptionsSchema } from "../lib/server/knowledge-theme-import";
import { legacyDigest } from "../lib/domain/knowledge-legacy";
import { knowledgePinSchema } from "../lib/domain/knowledge-foundation";

const base = "http://localhost:3276";
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("引数は --theme ID --namespace NAME --plan FILE または --apply FILE --token TOKEN です");
  if (options.has(args[i])) throw new Error(`引数が重複しています: ${args[i]}`);
  options.set(args[i], args[i + 1]);
}
async function request(endpoint: string, command?: unknown) {
  const response = await fetch(base + endpoint, command ? { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(command), signal: AbortSignal.timeout(30000) } : { redirect: "error", signal: AbortSignal.timeout(20000) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`確認環境のAPIが ${response.status} を返しました: ${JSON.stringify(body)}`);
  return body;
}
async function main() {
  const applyFile = options.get("--apply");
  if (applyFile) {
    if ([...options.keys()].some(k => !["--apply", "--token"].includes(k))) throw new Error("--apply は保存済み計画だけを使用します");
    const token = options.get("--token");
    if (!token) throw new Error("適用には保持中の共通作業ロック token が必要です");
    const guard = () => execFileSync("python3", ["scripts/autopilot.py", "assert-held", "--token", token], { stdio: ["ignore", "ignore", "pipe"] });
    guard();
    const saved = z.object({ observed: z.json(), options: themeKnowledgeImportOptionsSchema, commands: z.array(z.json()), themeId: z.string(), origin: z.object({ observedSha256: z.string() }) }).passthrough().parse(JSON.parse(await readFile(applyFile, "utf8")));
    const plan = prepareThemeKnowledgeImport(saved.observed, saved.options);
    if (legacyDigest(plan.commands) !== legacyDigest(saved.commands) || plan.themeId !== saved.themeId || plan.origin.observedSha256 !== saved.origin.observedSha256) throw new Error("計画と観測原本・hashが一致しません");
    if (plan.commands.some(command => Buffer.byteLength(JSON.stringify(command)) > 2_000_000)) throw new Error("取込コマンドがAPIの2MB上限を超えています。書込み前に対象記録の分割が必要です");
    const results: { action: string; requestId: string; completed: boolean }[] = [];
    for (const command of plan.commands) {
      guard();
      await request("/api/knowledge", command);
      results.push({ action: command.action, requestId: command.requestId, completed: true });
      console.log(JSON.stringify({ event: "command-accepted", step: results.length, total: plan.commands.length, action: command.action }));
    }
    const result = { schemaVersion: 1, themeId: plan.themeId, observedThemeId: plan.origin.themeId, observedRevision: plan.origin.themeRevision, observedSha256: plan.origin.observedSha256, counts: plan.counts, warnings: plan.warnings, commands: results,
      oldThemeWrites: 0, note: "通常APIの複数コマンド。bundle単体はtransaction、全体は安定requestIdで再開。旧テーマ/Capsule/共有は変更しない" };
    await writeFile(applyFile + ".result.json", JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(result));
    return;
  }
  if ([...options.keys()].some(k => !["--theme", "--namespace", "--plan", "--bindings"].includes(k))) throw new Error("未知の計画オプションです");
  const themeId = options.get("--theme"), output = options.get("--plan"), namespace = options.get("--namespace");
  if (!themeId || !output || !namespace) throw new Error("計画には --theme ID --namespace NAME --plan FILE を指定してください");
  const bindingsPath = options.get("--bindings");
  const entityBindings = bindingsPath ? z.record(z.string(), knowledgePinSchema).parse(JSON.parse(await readFile(bindingsPath, "utf8"))) : {};
  const observed = await request("/api/themes?theme=" + encodeURIComponent(themeId));
  const plan = prepareThemeKnowledgeImport(observed, { namespace, entityBindings });
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  // Never overwrite an observed plan with a later live Theme revision.
  await writeFile(output, JSON.stringify(plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ event: "plan-saved", file: output, themeId: plan.themeId, observedThemeId: plan.origin.themeId, observedRevision: plan.origin.themeRevision, observedSha256: plan.origin.observedSha256, counts: plan.counts, warnings: plan.warnings, entityBindings: plan.entityBindings, writes: 0 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "取込に失敗しました"); process.exitCode = 1; });
