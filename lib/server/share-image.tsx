import "server-only";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PublicLocale } from "../domain/public-routes";
import { discoveryLabels } from "../i18n/public-discovery";
let font: Promise<Buffer> | undefined;
export async function shareImage(locale: PublicLocale, subject?: { name: string; kind: "person" | "work" | "organization" | "event" }) {
  // A local OFL font supports stored Japanese names without a third-party font request.
  const data = await (font ??= readFile(path.join(process.cwd(), "app/fonts/BIZUDPMincho-OG.woff")));
  const title = subject ? Array.from(subject.name).slice(0, 30).join("") + (Array.from(subject.name).length > 30 ? "…" : "")
    : locale === "en" ? "Follow a connection.\nFind a new curiosity." : "ひとつのつながりから、\n次の好奇心へ。";
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f6f3", color: "#213b51" }}>
    <div style={{ position: "absolute", inset: 38, display: "flex", border: "1px solid #d6e1e5", borderRadius: 24 }} />
    <div style={{ display: "flex", width: 540, alignItems: "center", textAlign: "center", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}><svg width="64" height="64" viewBox="0 0 64 64"><path d="M16 10V54M16 10L39 17L51 30L38 42L16 32L39 17" fill="none" stroke="#17508e" strokeWidth="3.5"/><circle cx="16" cy="10" r="8" fill="#174d89"/><circle cx="16" cy="32" r="5.5" fill="#6ba8e5"/><circle cx="16" cy="54" r="8" fill="#174d89"/><circle cx="39" cy="17" r="5.5" fill="#6ba8e5"/><circle cx="51" cy="30" r="7" fill="#174d89"/><circle cx="38" cy="42" r="5.5" fill="#6ba8e5"/></svg><div style={{ fontSize: 64 }}>Plunode</div></div>
      <div style={{ fontSize: 22, color: "#56758a" }}>{subject ? discoveryLabels(locale).kinds[subject.kind] : locale === "en" ? "An interactive knowledge graph" : "知識のつながりを探索する"}</div>
      <div style={{ display: "flex", fontSize: subject ? 46 : 36, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", justifyContent: "center", maxHeight: 210, overflow: "hidden" }}>{title}</div>
      <div style={{ fontSize: 21, color: "#56758a" }}>{locale === "en" ? "Connections, records and sources" : "関係を辿り、根拠となる資料へ"}</div>
      <div style={{ fontSize: 18, color: "#70838f" }}>plunode.net · Public beta</div>
    </div>
  </div>, { width: 1200, height: 630, fonts: [{ name: "Editorial", data, style: "normal", weight: 400 }], headers: { "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
}
