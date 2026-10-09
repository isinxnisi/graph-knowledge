import "server-only";
import { datasetMode } from "../../domain/dataset";
import { createMemberAuth, memberAuthReady, memberPool } from "./auth";
import { memberConfig, MemberUnavailable } from "./config";
import { createMemberService } from "./service";

function createRuntime() {
  const config = memberConfig();
  if (!config) throw new MemberUnavailable();
  const pool = memberPool(config);
  const auth = createMemberAuth(config, pool);
  return { config, pool, auth, service: createMemberService(config, pool, auth, datasetMode(process.env.GRAPH_DATASET)) };
}
// Lazy: disabled/misconfigured member storage never blocks KG startup/build.
let runtime: ReturnType<typeof createRuntime> | undefined;
export function memberRuntime() {
  if (!runtime) {
    const instance = createRuntime();
    runtime = instance;
    // Initialization can fail before a session request (e.g. DB starts late).
    // Do not cache a rejected auth context until the next process restart.
    void memberAuthReady(instance.auth).catch(() => {
      if (runtime === instance) runtime = undefined;
      void instance.pool.end().catch(() => {});
    });
  }
  return runtime;
}
