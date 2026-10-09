import { memberConfig, MemberUnavailable } from "../../../../lib/server/member/config";
import { memberHandle, memberJson } from "../../../../lib/server/member/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Public capability only: never serialize configuration, credentials or session.
export function GET() {
  return memberHandle(async () => {
    const config = memberConfig();
    if (!config) throw new MemberUnavailable();
    return memberJson({ provider: config.provider.kind });
  });
}
