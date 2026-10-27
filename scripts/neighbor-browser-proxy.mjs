// Local browser fault fixture only. Forward GETs to beta; never forward writes.
// Usage: node scripts/neighbor-browser-proxy.mjs PRIVATE_CONTROL_JSON
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
if (process.argv.length !== 3) throw Error("Provide a private control JSON path");
const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    const target = new URL(req.url, "http://127.0.0.1:3200");
    const neighbor = /^\/api\/entities\/[^/]+\/neighbors$/.test(target.pathname);
    const mode = neighbor ? JSON.parse(await readFile(process.argv[2], "utf8")) : {};
    if (mode.delayMs) await new Promise(r => setTimeout(r, Math.min(mode.delayMs, 15000)));
    if (mode.status) {
      res.writeHead(mode.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: { code: mode.status === 409 ? "DATASET_CHANGED" : "SERVICE_UNAVAILABLE", message: "ブラウザ検証用の応答" } })); return;
    }
    if (mode.cap) target.searchParams.delete("after");
    const forwarded = Object.fromEntries(Object.entries(req.headers).filter(([key, value]) => ["accept", "rsc", "next-router-state-tree", "next-router-prefetch", "next-url"].includes(key) && typeof value === "string"));
    const response = await fetch(target, { headers: forwarded, signal: AbortSignal.timeout(20000) });
    let body = Buffer.from(await response.arrayBuffer());
    if (mode.cap && response.ok) {
      const page = JSON.parse(body.toString()), center = page.nodes.find(n => n.id === page.centerId), sample = page.claims[0];
      if (!sample) throw Error("Choose an origin with an adjacent Claim for cap fixture");
      const otherId = sample.subjectId === center.id ? sample.objectId : sample.subjectId;
      const other = page.nodes.find(n => n.id === otherId);
      page.nodes = [center]; page.claims = [];
      for (let n = 0; n < 20; n++) {
        const node = { ...other, id: randomUUID(), name: `表示上限検証 ${n + 1}` }; page.nodes.push(node);
        page.claims.push({ ...sample, id: randomUUID(), subjectId: sample.subjectId === center.id ? center.id : node.id, objectId: sample.objectId === center.id ? center.id : node.id });
      }
      page.page = { hasMore: true, nextCursor: "browser-fixture-next" }; body = Buffer.from(JSON.stringify(page));
    }
    const headers = Object.fromEntries([...response.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding", "set-cookie"].includes(k)));
    res.writeHead(response.status, { ...headers, "Cache-Control": "no-store" }); res.end(body);
  } catch { res.writeHead(502); res.end("Local browser fixture failed"); }
});
server.listen(3287, "127.0.0.1", () => console.log("Read-only browser fixture: http://127.0.0.1:3287"));
