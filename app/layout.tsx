import { UiLocaleProvider } from "../lib/client/ui-locale";
import "./theme.css";
import "./ui.css";
import styles from "./layout.module.css";

import type { ReactNode } from "react";

export const metadata = { title: "関係性を探索する" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja"><body className={styles.body}><UiLocaleProvider>{children}</UiLocaleProvider></body></html>;
}
