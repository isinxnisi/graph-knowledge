import localFont from "next/font/local";
import { UiLocaleProvider } from "../lib/client/ui-locale";
import "./theme.css";
import "./ui.css";
import styles from "./layout.module.css";

import type { ReactNode } from "react";

const editorial = localFont({ src: "./fonts/BIZUDPMincho-Regular.woff2", weight: "400", display: "swap", variable: "--font-editorial-face", preload: true });

export const metadata = { title: "関係性を探索する" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ja" className={editorial.variable}><body className={styles.body}><UiLocaleProvider>{children}</UiLocaleProvider></body></html>;
}
