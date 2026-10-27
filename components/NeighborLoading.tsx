"use client";
import { useEffect, useState } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

// Mount only while a request is pending; key by Entity + request. The operation
// is disabled immediately, but a fast response never flashes a loading notice.
export default function NeighborLoading({ name, more }: { name: string; more: boolean }) {
  const [visible, setVisible] = useState(false);
  const { locale } = useUiLocale();
  useEffect(() => { const timer = setTimeout(() => setVisible(true), 200); return () => clearTimeout(timer); }, []);
  if (!visible) return null;
  const text = explorationLabels(locale);
  return <p role="status" className={styles.neighborLoading}><strong>{name}</strong> — {more ? text.neighborsLoadingMore : text.neighborsLoading} <span>{text.neighborsInteractive}</span></p>;
}
