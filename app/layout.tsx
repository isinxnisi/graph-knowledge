import "./theme.css";
import styles from "./layout.module.css";

import type { ReactNode } from "react";

export const metadata = { title: "関係性を探索する | 架空のデモデータ" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body className={styles.body}>{children}</body></html>;
}
