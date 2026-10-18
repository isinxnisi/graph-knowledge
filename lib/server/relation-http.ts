import "server-only";
import { ApiError, json } from "./http";

type Reason = "INVALID_REQUEST" | "INVALID_CONDITION" | "UNSUPPORTED_CONDITION" | "INVALID_CURSOR" | "INVALID_WITNESS" | "RESTORE_INCOMPLETE" | "ROOT_NOT_FOUND" | "REVISION_CHANGED" | "UNCONFIRMED" | "INTERNAL";
export class RelationRequestError extends ApiError {
  constructor(status: number, code: ConstructorParameters<typeof ApiError>[1], public reason: Reason, message: string) { super(status, code, message); }
}
const invalid = (reason: Reason = "INVALID_REQUEST") => new RelationRequestError(400, "INVALID_ARGUMENT", reason, "対象検索の条件が不正または未対応です。");
const unconfirmed = () => new RelationRequestError(503, "SERVICE_UNAVAILABLE", "UNCONFIRMED", "検索を確認できませんでした。時間をおいて再試行してください。");
async function readBody(request: Request, signal: AbortSignal) {
  if (new URL(request.url).search || !request.headers.get("content-type")?.split(";")[0].trim().match(/^application\/json$/i) || !request.body) throw invalid();
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) { signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) throw invalid(); chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes), value: unknown = JSON.parse(text);
      // JSON.parse alone silently accepts a duplicate (including escaped) key.
      const stack: (Set<string> | null)[] = [];
      for (const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)) {
        const t = token[0];
        if (t === "{") stack.push(new Set()); else if (t === "[") stack.push(null);
        else if (t === "}" || t === "]") stack.pop();
        else {
          let index = token.index! + t.length; while (/\s/.test(text[index] ?? "") && index < text.length) index++;
          if (text[index] === ":") { const key: string = JSON.parse(t), keys = stack.at(-1); if (keys?.has(key)) throw invalid(); keys?.add(key); }
        }
      }
      return value;
    } catch { throw invalid(); }
  } finally { signal.removeEventListener("abort", cancel); void reader.cancel().catch(() => {}); }
}
// Includes body acquisition, pool acquisition and the transaction. No retries.
export async function handleRelationPost<T>(request: Request, action: (input: unknown, signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController(), signal = AbortSignal.any([request.signal, controller.signal]);
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let onAbort: () => void = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => { onAbort = () => reject(unconfirmed()); signal.addEventListener("abort", onAbort, { once: true }); if (signal.aborted) onAbort(); });
    return json(await Promise.race([cancelled, (async () => action(await readBody(request, signal), signal))()]));
  } catch (error) {
    let failure: RelationRequestError;
    if (error instanceof RelationRequestError) failure = error;
    else if (error instanceof ApiError && error.code === "DATASET_CHANGED") failure = new RelationRequestError(409, error.code, "REVISION_CHANGED", error.message);
    else if (error instanceof ApiError && error.status === 503) failure = unconfirmed();
    else if (signal.aborted || error instanceof Error && "code" in error && /ServiceUnavailable|SessionExpired|ECONN|ETIMEDOUT|TransactionTimedOut|Neo\.TransientError/.test(String(error.code))) failure = unconfirmed();
    else { console.error("Relation request failed"); failure = new RelationRequestError(500, "INTERNAL_ERROR", "INTERNAL", "検索結果を確認できませんでした。"); }
    return json({ error: { code: failure.code, message: failure.message, reason: failure.reason } }, failure.status);
  } finally { clearTimeout(timeout); signal.removeEventListener("abort", onAbort); }
}
