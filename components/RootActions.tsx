"use client";
import { useUiLocale } from "../lib/client/ui-locale";
import { overviewLabels } from "../lib/i18n/entity-overview";
import styles from "./Explorer.module.css";
export default function RootActions({ restricted, disabled = false, onSwitch }: {
  restricted: boolean; disabled?: boolean; onSwitch: (mode: "broad" | "same") => void;
}) {
  const { locale } = useUiLocale();
  const labels = overviewLabels(locale);
  return <div className={`${styles.actions} ${styles.rootActions}`}>
    <button disabled={disabled} onClick={() => onSwitch("broad")}>{labels.broad}</button>
    {restricted && <button disabled={disabled} onClick={() => onSwitch("same")}>{labels.same}</button>}
  </div>;
}
