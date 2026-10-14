import { ImageResponse } from "next/og";
export const alt = "Plunode — 知識のつながりを探索する";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#f5f6f3", color: "#213b51", padding: 90 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}><div style={{ fontSize: 86 }}>Plunode</div><div style={{ fontSize: 28, color: "#56758a" }}>Follow a connection. Find a new curiosity.</div><div style={{ display: "flex", gap: 22, marginTop: 35 }}>{["People", "Works", "Ideas"].map((name, i) => <div key={name} style={{ display: "flex", alignItems: "center", gap: 22 }}><div style={{ padding: "18px 30px", border: "1px solid #afc7d6", borderRadius: i === 0 ? 50 : 12, background: i === 1 ? "#e8f2fa" : "#fffefa", fontSize: 23 }}>{name}</div>{i < 2 && <div style={{ color: "#7190a5", fontSize: 28 }}>→</div>}</div>)}</div><div style={{ fontSize: 20, color: "#70838f", marginTop: 15 }}>plunode.net · Public beta</div></div>
  </div>, size);
}
