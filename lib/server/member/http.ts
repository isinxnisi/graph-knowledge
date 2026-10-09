import { z } from "zod";
import { MEMBER_CAPSULE_LIMITS } from "../../domain/member-capsule";
import { MemberUnavailable } from "./config";

export class MemberError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function memberJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function memberHandle(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof MemberError) return memberJson({ error: { code: error.code } }, error.status);
    if (error instanceof MemberUnavailable) return memberJson({ error: { code: "MEMBER_UNAVAILABLE" } }, 503);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const unavailable = /^(08|53|57P|ECONN|ETIMEDOUT)/.test(code) || (error instanceof Error && /timeout|connection terminated/i.test(error.message));
    console.error(unavailable ? "Member database unavailable" : "Member internal error");
    return memberJson({ error: { code: unavailable ? "MEMBER_UNAVAILABLE" : "INTERNAL_ERROR" } }, unavailable ? 503 : 500);
  }
}
export function assertMemberOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new MemberError(403, "INVALID_ORIGIN");
}
export async function memberInput<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new MemberError(415, "JSON_REQUIRED");
  const reader = request.body?.getReader();
  if (!reader) throw new MemberError(400, "INVALID_ARGUMENT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MEMBER_CAPSULE_LIMITS.bytes) {
        await reader.cancel();
        throw new MemberError(413, "BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const result = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (result.success) return result.data;
  } catch { /* JSON syntax never leaks body contents. */ }
  throw new MemberError(400, "INVALID_ARGUMENT");
}
export function memberId(value: string) {
  const result = z.uuidv4().safeParse(value);
  if (!result.success) throw new MemberError(400, "INVALID_ARGUMENT");
  return result.data.toLowerCase();
}
