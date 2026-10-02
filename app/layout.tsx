import type { ReactNode } from "react";

export const metadata = { title: "関係性を探索する | 架空のデモデータ" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
