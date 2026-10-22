import {CommunityAvailability} from "../components/CommunityAvailability";
import {AiLabAvailability} from "../components/AiLabLinks";
import FocusModality from "../components/FocusModality";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { UiLocaleProvider } from "../lib/client/ui-locale";
import "./theme.css";
import "./ui.css";
import styles from "./layout.module.css";

import type { ReactNode } from "react";

const editorial = localFont({ src: "./fonts/BIZUDPMincho-Regular.woff2", weight: "400", display: "swap", variable: "--font-editorial-face", preload: true });

export const metadata = { metadataBase: new URL("https://plunode.net"), title: "Plunode — 知識のつながりを探索する", robots: { index: false, follow: false }, referrer: "strict-origin-when-cross-origin" as const };
export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-plunode-locale") === "en" ? "en" : "ja";
  const publicLocale = requestHeaders.get("x-plunode-public-locale");
  return <html lang={locale} data-input-modality="initial" className={editorial.variable}><body className={styles.body}><UiLocaleProvider initialLocale={publicLocale === "en" ? "en" : publicLocale === "ja" ? "ja" : undefined}><CommunityAvailability enabled={process.env.COMMUNITY_ENABLED === "1"}><AiLabAvailability enabled={process.env.AI_LAB_ENABLED === "1" && process.env.GRAPH_DATASET === "public-kg"}><FocusModality />{children}</AiLabAvailability></CommunityAvailability></UiLocaleProvider></body></html>;
}
