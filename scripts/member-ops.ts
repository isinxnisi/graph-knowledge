import { parseArgs } from "node:util";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { memberOperationSchema, operateMember } from "../lib/server/member/operations";

let pool: ReturnType<typeof memberPool> | undefined;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    actor: { type: "string" }, reason: { type: "string" }, apply: { type: "boolean", default: false },
    confirm: { type: "string" }, origin: { type: "string" },
  } });
  const config = memberConfig();
  if (!config || positionals.length !== 2 || values.origin !== config.origin) throw new Error();
  const input = memberOperationSchema.parse({ action: positionals[0], target: positionals[1], actor: values.actor, reason: values.reason });
  if (values.apply && values.confirm !== input.target) throw new Error();
  pool = memberPool(config);
  console.log(JSON.stringify(await operateMember(pool, input, values.apply)));
} catch {
  console.error("運営操作失敗。接続環境・origin・操作・UUID・actor・reasonと、適用時の--confirmを確認してください。秘密情報は出力していません。");
  process.exitCode = 1;
} finally { await pool?.end(); }
