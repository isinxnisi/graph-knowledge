import {readFileSync} from "node:fs";
import {
  matchSourceExcerpt, normalizeSourceText, publicSourceDocument, SourceCheckError,
  type SourceDocument, sourceText, sourceURL,
} from "../../../lib/server/knowledge-source-verification";

type Candidate = {url: string; excerpt: string};

async function inspect({url, excerpt}: Candidate, documents: Map<string, Promise<SourceDocument>>) {
  try {
    const requestedUrl = sourceURL(url).href;
    if (!documents.has(requestedUrl)) documents.set(requestedUrl, publicSourceDocument(requestedUrl));
    const copy = await documents.get(requestedUrl)!;
    const proof = {...matchSourceExcerpt(copy, excerpt), requestedUrl};
    const text = normalizeSourceText(sourceText(copy));
    const quote = normalizeSourceText(excerpt);
    const at = text.indexOf(quote);
    return {proof, context: text.slice(Math.max(0, at - 420), at + quote.length + 420)};
  } catch (error) {
    return {error: error instanceof SourceCheckError ? error.message : "原資料から本文を取得できませんでした。"};
  }
}

async function main() {
  const candidates: Candidate[] = JSON.parse(readFileSync(0, "utf8"));
  const results = [];
  const documents = new Map<string, Promise<SourceDocument>>();
  for (const candidate of candidates) results.push(await inspect(candidate, documents));
  process.stdout.write(JSON.stringify(results));
}

main().catch(() => { process.exitCode = 1; });
