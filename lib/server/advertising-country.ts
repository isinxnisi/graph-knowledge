import "server-only";
import ipaddr from "ipaddr.js";
import japan from "../../data/advertising/japan-ranges.json";

// Country data is an approximation. Unknown, invalid or stale results require consent.
export function isJapanAddress(value: string | null, now = Date.now()): boolean {
  if (!value || now > Date.parse(`${japan.release}-01T00:00:00Z`) + 90 * 86400000) return false;
  try {
    if (value.includes("%")) return false;
    const address = ipaddr.process(value);
    if (address.range() !== "unicast") return false;
    const hex = address.toByteArray().map(byte => byte.toString(16).padStart(2, "0")).join("");
    const ranges = address.kind() === "ipv4" ? japan.ipv4 : japan.ipv6;
    let low = 0, high = ranges.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1, [first, last] = ranges[middle];
      if (hex < first) high = middle - 1;
      else if (hex > last) low = middle + 1;
      else return true;
    }
  } catch { /* Invalid header values never enable advertising. */ }
  return false;
}

export function defaultAdvertising(headers: Pick<Headers, "get">, env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  const host = headers.get("host");
  // The production Web port is loopback-only. Caddy overwrites client-supplied XFF.
  if (env.GRAPH_DEPLOYMENT === "production" && /^(?:plunode\.net)(?::443)?$/.test(host ?? "")) return isJapanAddress(headers.get("x-forwarded-for"), now);
  if (env.GRAPH_DEPLOYMENT !== "production") {
    // Local display checks are explicitly authorized. Do not use language/timezone as location.
    if (/^(?:localhost|127\.0\.0\.1):\d+$/.test(host ?? "")) return true;
    if (host === "graph-beta.isinxnisi.com") return isJapanAddress(headers.get("cf-connecting-ipv6") ?? headers.get("cf-connecting-ip"), now);
  }
  return false;
}
