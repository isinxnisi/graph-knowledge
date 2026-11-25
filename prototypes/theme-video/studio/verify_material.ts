import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {
  matchSourceExcerpt, normalizeSourceText, publicSourceDocument, SourceCheckError,
  type SourceDocument, sourceText, sourceURL,
} from "../../../lib/server/knowledge-source-verification";

type Candidate = {url: string; excerpt: string};
type PdfMatch = {proof: {pages: number[]}; locator: string; context: string} | {error: string};

function pdfMatches(copy: SourceDocument, excerpts: string[], library: string): PdfMatch[] {
  const python = process.platform === "win32" ? "python" : "python3";
  const child = spawnSync(python, ["-B", "prototypes/theme-video/studio/pdf_material.py", library], {
    input: JSON.stringify({body: copy.body.toString("base64"), excerpts}),
    encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 2_000_000, windowsHide: true,
  });
  if (child.status !== 0 || child.error) return excerpts.map(() => ({error: "PDF本文を時間・容量の上限内で抽出できませんでした。"}));
  const output = JSON.parse(child.stdout);
  if (output.error) return excerpts.map(() => ({error: output.error}));
  return output.matches;
}

async function inspect({url, excerpt}: Candidate, index: number, excerpts: string[], pdfLibrary: string,
                       documents: Map<string, Promise<SourceDocument>>, pages: Map<SourceDocument, PdfMatch[]>) {
  try {
    const requestedUrl = sourceURL(url).href;
    if (!documents.has(requestedUrl)) documents.set(requestedUrl, publicSourceDocument(requestedUrl, {allowPdf: true}));
    const copy = await documents.get(requestedUrl)!;
    if (copy.type.split(";", 1)[0] === "application/pdf") {
      if (!pages.has(copy)) pages.set(copy, pdfMatches(copy, excerpts, pdfLibrary));
      const match = pages.get(copy)![index];
      if ("error" in match) return match;
      return {...match, proof: {...match.proof, url: copy.url, requestedUrl, checkedAt: new Date().toISOString()}};
    }
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
  // A studio started before PDF support sends the candidate array directly.
  const input: Candidate[] | {candidates: Candidate[]; pdfLibrary?: string} = JSON.parse(readFileSync(0, "utf8"));
  const candidates = Array.isArray(input) ? input : input.candidates;
  const pdfLibrary = Array.isArray(input) ? "" : input.pdfLibrary ?? "";
  const results = [];
  const documents = new Map<string, Promise<SourceDocument>>();
  const pages = new Map<SourceDocument, PdfMatch[]>();
  const excerpts = candidates.map(candidate => candidate.excerpt);
  for (const [index, candidate] of candidates.entries()) {
    results.push(await inspect(candidate, index, excerpts, pdfLibrary, documents, pages));
  }
  process.stdout.write(JSON.stringify(results));
}

main().catch(() => { process.exitCode = 1; });
