import { eventRoleSchema } from "../domain/event-participation";
import { eventParticipationLabels } from "../i18n/event-participation";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import { organizationPositionSchema } from "../domain/organization-participation";
import { roleIdSchema } from "../domain/contribution";
import { searchLabels } from "../i18n/entity-search";
import { explorationLabels } from "../i18n/exploration";
import { z } from "zod";
import { normalizeEventRoles, normalizeContributionRoles, normalizeOrganizationPositions, normalizePredicates } from "../domain/exploration";
import { PREDICATE_KEYS } from "../domain/predicates";
import { SEARCH_KINDS, normalizeSearch } from "../domain/search";

type ErrorCode = "INVALID_ARGUMENT" | "NOT_FOUND" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) { super(message); }
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extraHeaders } });
}

export function methodNotAllowed() {
  return json({ error: { code: "INVALID_ARGUMENT", message: "GETメソッドのみ利用できます。" } }, 405, { Allow: "GET" });
}

function isUnavailable(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") return false;
  return ["ServiceUnavailable", "SessionExpired", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(error.code)
    || /TransactionTimedOut|TransactionTimedOutClientConfiguration/.test(error.code)
    || error.code.startsWith("Neo.TransientError.");
}

export async function handle<T>(action: () => Promise<T>) {
  try { return json(await action()); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
    const unavailable = isUnavailable(error);
    // Only a category is logged; never expose DB statements, credentials or raw errors.
    console.error(unavailable ? "API database unavailable" : "API internal error");
    return json({ error: {
      code: unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
      message: unavailable ? "データベースを利用できません。時間をおいて再試行してください。" : "処理中にエラーが発生しました。",
    } }, unavailable ? 503 : 500);
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "INVALID_ARGUMENT", message);
  return result.data;
}

export function parseId(value: unknown): string {
  return parse(z.uuidv4(), value, "UUID v4を指定してください。").toLowerCase();
}

function single(params: URLSearchParams, key: string) {
  if (params.getAll(key).length > 1) throw new ApiError(400, "INVALID_ARGUMENT", `${key}は一つだけ指定してください。`);
  return params.get(key);
}

function limit(params: URLSearchParams, defaultValue: number, max: number): number {
  const value = single(params, "limit");
  if (value === null) return defaultValue;
  if (!/^\d+$/.test(value)) throw new ApiError(400, "INVALID_ARGUMENT", "limitは整数で指定してください。");
  return parse(z.number().int().min(1).max(max), Number(value), `limitは1〜${max}で指定してください。`);
}

export function searchInput(request: Request) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (!["q", "limit", "kind"].includes(key)) throw new ApiError(400, "INVALID_ARGUMENT", searchLabels().unsupported);
  const kind = single(params, "kind");
  const kinds = kind === null ? [...SEARCH_KINDS] : [parse(z.enum(SEARCH_KINDS), kind, searchLabels().invalidKind)];
  const q = single(params, "q");
  if (q === null) throw new ApiError(400, "INVALID_ARGUMENT", "qを指定してください。");
  const normalized = normalizeSearch(q);
  return {
    q: parse(z.string().min(1).refine((text) => [...text].length <= 100), normalized, "qは1〜100文字で指定してください。"),
    limit: limit(params, 10, 20), kinds,
  };
}

export function neighborsInput(request: Request) {
  const params = new URL(request.url).searchParams;
  const after = single(params, "after");
  for (const key of params.keys()) if (!["after", "limit", "predicates", "contributionRoles", "organizationPositions", "eventRoles"].includes(key)) {
    throw new ApiError(400, "INVALID_ARGUMENT", explorationLabels().unsupported);
  }
  const raw = single(params, "predicates");
  const predicates = raw === null ? null : normalizePredicates(parse(z.array(z.enum(PREDICATE_KEYS)), raw === "" ? [] : raw.split(","), explorationLabels().invalidPredicates));
  const rawRoles = single(params, "contributionRoles");
  const roles = rawRoles === null ? null : normalizeContributionRoles(parse(z.array(roleIdSchema), rawRoles === "" ? [] : rawRoles.split(","), "制作Roleが不正です。"), predicates);
  const rawPositions = single(params, "organizationPositions");
  const positions = rawPositions === null ? null : normalizeOrganizationPositions(parse(z.array(organizationPositionSchema), rawPositions === "" ? [] : rawPositions.split(","), organizationParticipationLabels().invalid), predicates);
  const rawEventRoles = single(params, "eventRoles");
  const eventRoles = rawEventRoles === null ? null : normalizeEventRoles(parse(z.array(eventRoleSchema), rawEventRoles === "" ? [] : rawEventRoles.split(","), eventParticipationLabels().invalid), predicates);
  return { limit: limit(params, 20, 50), after, predicates, ...(roles !== null ? { contributionRoles: roles } : {}), ...(positions !== null ? { organizationPositions: positions } : {}), ...(eventRoles !== null ? { eventRoles } : {}) };
}
