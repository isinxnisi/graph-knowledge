import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { memberConfig } from "../lib/server/member/config";
import { memberPool } from "../lib/server/member/auth";
import { migrateMemberDatabase } from "../lib/server/member/migrate";
import { startMemberOidc } from "./support/member-oidc";
vi.mock("server-only", () => ({}));
import { GET } from "../app/api/member/capsules/route";
import { memberRuntime } from "../lib/server/member/runtime";

it("DBが停止した状態で初回アクセスしても503となり、復旧後に初期化を再試行する", async () => {
  const config = memberConfig()!;
  if (config.provider.kind !== "fixture") throw new Error("Run in dedicated member test DB");
  const fixture = await startMemberOidc();
  const setup = memberPool(config);
  const url = new URL(config.databaseUrl); url.pathname = "/postgres";
  const control = new Pool({ connectionString: url.href, connectionTimeoutMillis: 3000 });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await migrateMemberDatabase(setup);
    await setup.end();
    await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS false");
    const response = await GET(new Request(`${config.origin}/api/member/capsules`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "MEMBER_UNAVAILABLE" } });
    await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS true");
    // After recovery the anonymous request is correctly classified as 401.
    expect((await GET(new Request(`${config.origin}/api/member/capsules`))).status).toBe(401);
    await memberRuntime().pool.end();
  } finally {
    await control.query("ALTER DATABASE graph_member_test ALLOW_CONNECTIONS true");
    await control.end();
    await fixture.close();
    log.mockRestore();
  }
}, 20_000);
