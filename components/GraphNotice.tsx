"use client";
import { useEffect, useState } from "react";
import type { GraphNoticePresentation } from "../lib/client/graph-notice";
import styles from "./GraphNotice.module.css";
export const GRAPH_NOTICE_DURATION = 3500;
export default function GraphNotice({ notice }: { notice: GraphNoticePresentation }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (notice.kind !== "info") return;
    const timer = setTimeout(() => setVisible(false), GRAPH_NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [notice.kind]);
  if (notice.kind === "warning") return <p role="alert" data-testid="graph-warning" className={styles.warning}>{notice.text}</p>;
  return visible ? <p role="status" aria-atomic="true" title={notice.detail} data-testid="graph-notice" className={styles.toast}><span aria-hidden="true" />{notice.text}</p> : null;
}
