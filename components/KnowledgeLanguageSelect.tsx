"use client";
import type { KnowledgeTextLanguage } from "../lib/domain/knowledge-language";
import css from "./KnowledgeSubmissions.module.css";

export default function KnowledgeLanguageSelect({ label, value, locale, onChange, disabled }: { label: string; value?: KnowledgeTextLanguage; locale: string; onChange: (tag: string) => void; disabled?: boolean }) {
  const en = locale === "en", tag = value?.tag ?? "";
  return <label className={css.languageChoice}>{label}<select aria-label={label} value={tag} disabled={disabled} onChange={e => onChange(e.target.value)}>
    <option value="">{en ? "Unspecified" : "未指定"}</option>
    <option value="ja">日本語</option><option value="en">English</option>
    <option value="mul">{en ? "Mixed languages" : "複数の言語"}</option>
    {tag && !["ja", "en", "mul"].includes(tag) && <option value={tag}>{tag}</option>}
  </select></label>;
}
