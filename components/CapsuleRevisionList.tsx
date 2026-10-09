"use client";
import { useEffect, useRef, useState } from "react";
import { MemberClientError, memberRequest } from "../lib/client/member-api";
import { sharedRevisionListSchema, type SharedRevision } from "../lib/domain/capsule-sharing";
import { capsuleHistoryLabels } from "../lib/i18n/capsule-history";
import css from "./MemberCapsules.module.css";

export default function CapsuleRevisionList({ capsuleId, userId, disabled, onRead, onUnauthorized }: {
  capsuleId: string; userId: string; disabled: boolean; onRead: (revision: number) => void; onUnauthorized: () => void;
}) {
  const text = capsuleHistoryLabels();
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [items, setItems] = useState<SharedRevision[]>([]);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function load() {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setOpened(true); setBusy(true); setFailed(false); setItems([]);
    try {
      const result = await memberRequest(`/api/member/capsules/${capsuleId}/revisions`, sharedRevisionListSchema, { user: userId, signal: controller.signal });
      if (!controller.signal.aborted) setItems(result.revisions);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailed(true);
      if (error instanceof MemberClientError && error.status === 401) onUnauthorized();
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className={css.sharing} aria-label={text.title}>
    <button disabled={disabled} aria-expanded={opened} onClick={() => {
      if (opened) { active.current?.abort(); setOpened(false); setItems([]); } else void load();
    }}>{opened ? text.close : text.open}</button>
    {opened && <><h2>{text.title}</h2><p>{text.help}</p>
      {busy ? <p role="status">{text.loading}</p> : failed ? <p role="alert">{text.failed}</p> : !items.length ? <p>{text.empty}</p> :
        <ul className={css.posts}>{items.map(item => <li key={item.revision}><strong>{item.title}</strong><p className={css.muted}>{text.updated}<time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("ja-JP")}</time></p><button disabled={disabled} onClick={() => onRead(item.revision)}>{text.read(item.revision)}</button></li>)}</ul>}
      <button disabled={disabled || busy} onClick={() => void load()}>{text.retry}</button>
    </>}
  </section>;
}
