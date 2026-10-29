"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { DatasetMode } from "../lib/domain/dataset";
import { memberCapsuleContentSchema, type MemberCapsule } from "../lib/domain/member-capsule";
import { capsuleSchema, resolveCapsule, type LocalCapsule } from "../lib/client/local-capsules";
import { materializeLegacy } from "../lib/client/capsule-editor";
import { listBrowserCapsules, saveBrowserCapsule, capsuleMetadata, type CapsuleMetadata } from "../lib/client/capsule-store";
import { MemberClientError, memberCreateResultSchema, memberItemSchema, memberListSchema, memberReaderCapsule, memberRequest, type MemberCapsuleSummary } from "../lib/client/member-api";
import { useMemberSession, refreshMemberIdentity, getMemberIdentitySnapshot, invalidateMemberIdentity } from "../lib/client/use-member-identity";
import { useUiLocale } from "../lib/client/ui-locale";
import CapsuleStudio from "./CapsuleStudio";
import CapsuleSurface from "./CapsuleSurface";
import CapsuleShareControls from "./CapsuleShareControls";
import Icon from "./Icon";
import css from "./CapsuleStudio.module.css";

// PostgreSQL jsonb normalizes object-key order. Compare the JSON value while
// preserving array order; the original operation body remains unchanged for
// requestId retries and revision checks.
function sameSavedContent(left: MemberCapsule["content"], right: MemberCapsule["content"]) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key,item]) => [key,canonical(item)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function rejectExpiredSession(cause: unknown, session: ReturnType<typeof getMemberIdentitySnapshot>) {
  const current = getMemberIdentitySnapshot();
  if (!(cause instanceof MemberClientError) || cause.status !== 401 || current.version !== session.version || current.user?.id !== session.user?.id) return;
  invalidateMemberIdentity();
  void refreshMemberIdentity(true).catch(() => {});
}

function useCapsuleIdentityRefresh() {
  useEffect(() => {
    const check = () => {
      if (document.hidden) return;
      // Refresh in the background: a pending request or network failure is not
      // a revoked session. Keep the canvas, focus and draft mounted throughout.
      void refreshMemberIdentity(true).catch(() => {});
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) check(); };
    document.addEventListener("visibilitychange", check); window.addEventListener("pageshow", restored);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("pageshow", restored); };
  }, []);
}

export function CapsuleWorkspace({ initial, member, ownerId, isNew = false, onClose, onSaved }: { initial: LocalCapsule; member?: MemberCapsule; ownerId?: string; isNew?: boolean; onClose?: () => void; onSaved?: (value: MemberCapsule) => void }) {
  const identity = useMemberSession(), { locale } = useUiLocale();
  useCapsuleIdentityRefresh();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  const [owner, setOwner] = useState<string | null | undefined>(() => member ? ownerId ?? undefined : !isNew ? null : identity.status === "authenticated" ? identity.user!.id : identity.status === "guest" ? null : undefined);
  if (owner === undefined && !member) {
    if (identity.status === "authenticated" && identity.user) setOwner(identity.user.id);
    else if (identity.status === "guest") setOwner(null);
  }
  const [server, setServer] = useState(member ?? null), [base, setBase] = useState<LocalCapsule | null>(isNew ? null : initial);
  const [ready, setReady] = useState<LocalCapsule | null>(initial.document ? initial : null), [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [capacity, setCapacity] = useState<{ documents: boolean; storageBytes: number; totalBytes: number } | null>(null);
  type SaveAttempt = { signature: string; requestId: string; content: z.infer<typeof memberCapsuleContentSchema>; id: string | null; expectedRevision: number | null; asCopy: boolean };
  const pending = useRef<SaveAttempt | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!owner || identity.user?.id !== owner || identity.status !== "authenticated") return;
    const controller = new AbortController(), session = getMemberIdentitySnapshot();
    void memberRequest("/api/member/capsule-capabilities", z.object({ documents: z.boolean(), storageBytes: z.number().nonnegative(), totalBytes: z.number().positive() }), { user: owner, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setCapacity(result); }).catch(cause => { if (!controller.signal.aborted) { setCapacity(null); rejectExpiredSession(cause, session); } });
    return () => controller.abort();
  }, [owner, identity.user?.id, identity.status, identity.version, server?.revision]);
  useEffect(() => {
    if (initial.document) return;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
    void resolveCapsule(initial, controller.signal).then(resolved => { if (!controller.signal.aborted) setReady(materializeLegacy(initial, resolved)); }).catch(() => { if (!controller.signal.aborted) setError(t("旧版の参照を取得できませんでした。", "Could not load the legacy references.")); }).finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
    // Locale changes do not restart a record read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, attempt]);
  const locked = owner === undefined || !!owner && (identity.status !== "authenticated" || identity.user?.id !== owner);
  async function save(value: LocalCapsule, asCopy: boolean): Promise<LocalCapsule> {
    const content = memberCapsuleContentSchema.parse({ dataset: value.dataset, title: value.title, note: value.note, language: value.language, entityIds: value.entityIds, claimIds: value.claimIds, document: value.document });
    if (owner === undefined || member && !owner) throw Error(t("保存先のアカウントを確認しています。入力は保持しています。", "Checking the destination account. Your draft is retained."));
    if (owner) {
      const session = getMemberIdentitySnapshot();
      const currentSession = () => { const current = getMemberIdentitySnapshot(); return mounted.current && current.status === "authenticated" && current.user?.id === owner && current.version === session.version; };
      if (locked || !currentSession()) throw Error(t("元のアカウントでログインしてください。入力は保持しています。", "Sign in to the original account. Your draft is retained."));
      try {
        const updateSchema = memberItemSchema.extend({ replayed: z.boolean().optional(), appliedRevision: z.number().optional() });
        const perform = async (operation: SaveAttempt) => {
          const result = operation.id === null
            ? await memberRequest("/api/member/capsules", memberCreateResultSchema, { method: "POST", body: { requestId: operation.requestId, content: operation.content }, user: owner })
            : await memberRequest(`/api/member/capsules/${operation.id}`, updateSchema, { method: "PUT", body: { expectedRevision: operation.expectedRevision, requestId: operation.requestId, content: operation.content }, user: owner });
          if (!currentSession()) throw Error(t("アカウントの確認が必要です。元のアカウントで保存結果を確認してください。", "Check the save result after verifying the original account."));
          if (("appliedRevision" in result && result.appliedRevision && result.appliedRevision !== result.capsule.revision)
            || !sameSavedContent(result.capsule.content,operation.content)) throw Error(t("この保存の後に別の更新があります。入力は残しています。別のCapsuleとして保存できます。", "Another update followed this save. Your draft is retained; you can save it as a new Capsule."));
          return result.capsule;
        };
        const accept = (result: MemberCapsule) => { setServer(result); const local = memberReaderCapsule(result, value.dataset); setBase(local); onSaved?.(result); return local; };
        let expectedServer = server;
        // Resolve the exact uncertain operation before sending edited content.
        // Its body and key remain frozen, even if the user continues editing.
        if (pending.current && (!asCopy || pending.current.asCopy)) {
          const operation = pending.current;
          const recovered = await perform(operation);
          pending.current = null; expectedServer = recovered;
          if (sameSavedContent(operation.content,content)) return accept(recovered);
          accept(recovered);
        }
        const operation: SaveAttempt = { signature: JSON.stringify(content), content, requestId: crypto.randomUUID(), id: asCopy ? null : expectedServer?.id ?? null, expectedRevision: asCopy ? null : expectedServer?.revision ?? null, asCopy };
        pending.current = operation;
        const result = await perform(operation);
        pending.current = null; return accept(result);
      } catch (cause) {
        if (cause instanceof MemberClientError) {
          if (mounted.current) rejectExpiredSession(cause, session);
          throw Error(cause.code === "CAPSULE_STORAGE_LIMIT" ? t("アカウントのCapsule保存容量が上限です。入力は保持しています。", "Your account's Capsule storage is full. Your draft is retained.") : cause.status === 409 ? t("別の保存版と競合しました。入力は保持しています。別のCapsuleとして保存できます。", "A newer save conflicts with this draft. Your input is retained; you can save a new Capsule.") : t("保存結果を確認できませんでした。同じ保存を再試行できます。入力は保持しています。", "Could not confirm the save. Retry the same save; your draft is retained."));
        }
        throw cause;
      }
    }
    const next = capsuleSchema.parse({ ...value, id: asCopy ? crypto.randomUUID() : value.id, revision: asCopy ? 1 : base ? base.revision + 1 : 1, createdAt: asCopy ? new Date().toISOString() : value.createdAt, updatedAt: !asCopy && base ? new Date().toISOString() : undefined });
    try { await saveBrowserCapsule(next, asCopy ? null : base); }
    catch { throw Error(t("ブラウザに保存できませんでした。容量や別タブの更新を確認してください。入力は残っています。", "Could not save in this browser. Check storage capacity or changes in another tab. Your draft is retained.")); }
    setBase(next); return next;
  }
  if (owner === undefined) return <section className={css.library}><p role="status">{t("保存先のアカウントを確認しています…", "Checking the destination account…")}</p><button onClick={() => void refreshMemberIdentity(true).catch(() => {})}>{t("再確認", "Retry")}</button>{!member && identity.error && <button onClick={() => setOwner(null)}>{t("ブラウザ保存で続ける", "Continue with browser storage")}</button>}<button onClick={onClose}>{t("閉じる", "Close")}</button></section>;
  if (!ready) return <section className={css.library}><p role={error ? "alert" : "status"}>{error ?? t("Capsuleを開いています…", "Opening Capsule…")}</p>{error && <button onClick={() => { setError(null); setAttempt(v => v + 1); }}>{t("再試行", "Retry")}</button>}<button onClick={onClose}>{t("閉じる", "Close")}</button></section>;
  return <CapsuleSurface><CapsuleStudio capsule={ready} isNew={isNew} onClose={onClose} onSave={save} locked={locked} capacity={capacity} destination={owner ? t("アカウント", "Account") : t("このブラウザ", "This browser")}
    sharing={server && owner ? <CapsuleShareControls key={`${server.id}:${server.revision}`} capsule={server} userId={owner} disabled={locked} onUnauthorized={() => void refreshMemberIdentity(true).catch(() => {})} /> : undefined} /></CapsuleSurface>;
}

type Item = { key: string; title: string; updatedAt: string; member?: MemberCapsuleSummary; browser?: LocalCapsule; metadata: CapsuleMetadata };
export default function MyCapsules({ dataset, onClose }: { dataset: DatasetMode; onClose: () => void }) {
  const identity = useMemberSession(), { locale } = useUiLocale();
  useCapsuleIdentityRefresh();
  const t = (ja: string, en: string) => locale === "en" ? en : ja;
  const dialog = useRef<HTMLDialogElement>(null), active = useRef<AbortController | null>(null);
  const [items, setItems] = useState<Item[]>([]), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(true), [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<"recent" | "favorite" | "shared" | "published">("recent");
  const [opened, setOpened] = useState<{ capsule: LocalCapsule; member?: MemberCapsule; owner?: string } | null>(null);
  useEffect(() => { if (opened) dialog.current?.close(); else dialog.current?.showModal(); }, [opened]);
  useEffect(() => {
    const controller = new AbortController(), session = getMemberIdentitySnapshot(); active.current = controller;
    void (async () => {
      const rows: Item[] = [];
      try {
        const results = await Promise.allSettled([listBrowserCapsules(dataset), identity.status === "authenticated" && identity.user ? memberRequest("/api/member/capsules", memberListSchema, { user: identity.user.id, signal: controller.signal }) : Promise.resolve(null)]);
        if (results[0].status === "fulfilled") for (const capsule of results[0].value) rows.push({ key: `browser:${capsule.id}`, title: capsule.title, updatedAt: capsule.updatedAt ?? capsule.createdAt, browser: capsule, metadata: { id: `browser:${capsule.id}`, favorite: false, lastOpened: null } });
        if (results[1].status === "fulfilled" && results[1].value) for (const capsule of results[1].value.capsules) rows.push({ key: `member:${identity.user!.id}:${capsule.id}`, title: capsule.content.title, updatedAt: capsule.updatedAt, member: capsule, metadata: { id: `member:${identity.user!.id}:${capsule.id}`, favorite: false, lastOpened: null } });
        await Promise.all(rows.map(async row => { try { row.metadata = await capsuleMetadata(row.key); } catch { /* Listing remains available if personal metadata storage is unavailable. */ } }));
        if (!controller.signal.aborted) {
          const current = getMemberIdentitySnapshot();
          if (current.version !== session.version || current.user?.id !== session.user?.id) return;
          // Failed refreshes retain already loaded rows for the same owner. A
          // confirmed identity change still filters them out immediately.
          setItems(previous => [...rows, ...previous.filter(item => item.member ? results[1].status === "rejected" && item.key.startsWith(`member:${session.user?.id}:`) : results[0].status === "rejected")]);
          setBusy(false);
          if (results[1].status === "rejected") rejectExpiredSession(results[1].reason, session);
          if (results.some(r => r.status === "rejected")) setError(t("一部の保存一覧を取得できませんでした。再試行できます。", "Part of the list could not be loaded. You can retry."));
        }
      } catch { if (!controller.signal.aborted) { setBusy(false); setError(t("保存一覧を取得できませんでした。", "Could not load saved Capsules.")); } }
    })();
    return () => controller.abort();
    // The request belongs to this identity generation, not its display-name updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, identity.user?.id, identity.status, identity.version, attempt]);
  async function open(item: Item) {
    const session = getMemberIdentitySnapshot();
    if (item.member && (session.status !== "authenticated" || !item.key.startsWith(`member:${session.user?.id}:`))) return;
    setBusy(true); setError(null); const owner = session.user?.id, signal = active.current?.signal;
    try {
      if (item.member && owner) { const result = await memberRequest(`/api/member/capsules/${item.member.id}`, memberItemSchema, { user: owner, signal }); const current = getMemberIdentitySnapshot(); if (signal?.aborted || current.user?.id !== owner || current.status !== "authenticated" || current.version !== session.version) return; setOpened({ capsule: memberReaderCapsule(result.capsule, dataset), member: result.capsule, owner }); }
      else if (item.browser) setOpened({ capsule: item.browser });
      await capsuleMetadata(item.key, { lastOpened: new Date().toISOString() }).catch(() => {});
    } catch (cause) { if (!signal?.aborted) { rejectExpiredSession(cause, session); setError(t("Capsuleを開けませんでした。再試行してください。", "Could not open Capsule. Please retry.")); } }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  const rows = items.filter(item => (!item.member || identity.status === "authenticated" && item.key.startsWith(`member:${identity.user?.id}:`)) && (filter === "favorite" ? item.metadata.favorite : filter === "shared" ? !!item.member?.shared : filter === "published" ? !!item.member?.published : true)).sort((a, b) => (b.metadata.lastOpened ?? b.updatedAt).localeCompare(a.metadata.lastOpened ?? a.updatedAt));
  const empty = filter === "favorite" ? t("星を付けたCapsuleがここに並びます。", "Capsules you mark with a star appear here.")
    : filter === "shared" ? t("限定リンクで共有しているCapsuleはまだありません。", "You have no Capsules shared by link yet.")
    : filter === "published" ? t("コミュニティに掲載しているCapsuleはまだありません。", "You have no Capsules listed in a community yet.")
    : t("Capsuleはまだありません。Graphの「Capsule作成」から始められます。", "No Capsules yet. Start with “Create Capsule” on a graph.");
  return <><dialog className={css.drawer} ref={dialog} onCancel={onClose} aria-label="My Capsules">
    <div className={css.library}><header className={css.header}><div className={css.identity}><span className={css.eyebrow}><Icon name="capsule" />My Capsules</span><h2>{t("自分のCapsule", "Your Capsules")}</h2></div><button aria-label={t("一覧を閉じる", "Close list")} onClick={onClose}><Icon name="close" /></button></header>
    <div className={css.actions}>{([ ["recent", "history", t("最近", "Recent")], ["favorite", "star", t("お気に入り", "Favorites")], ["shared", "link", t("限定リンク", "Shared links")], ["published", "organization", t("コミュニティ", "Community")] ] as const).map(([key, icon, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}><Icon name={icon} />{label}</button>)}<button title={t("一覧を再取得", "Refresh list")} aria-label={t("一覧を再取得", "Refresh list")} onClick={() => { setError(null); setAttempt(v => v + 1); }}><Icon name="refresh" /></button></div>
    {busy && <p role="status">{t("読み込み中…", "Loading…")}</p>}{error && <p role="alert">{error}</p>}{!busy && !rows.length && <p className={css.empty}>{empty}</p>}
    <ul>{rows.map(item => <li key={item.key}><div><h3>{item.title}</h3>{(item.member?.shared || item.member?.published) && <div>{item.member.shared && <span className={css.badge}><Icon name="link" style={{width:12,height:12,marginRight:4}} />{t("限定リンクで共有中", "Link shared")}</span>}{item.member.published && <span className={css.badge}><Icon name="organization" style={{width:12,height:12,marginRight:4}} />{t("コミュニティ掲載中", "Listed in a community")}</span>}</div>}<p>{item.member ? t("アカウント", "Account") : t("ブラウザ", "Browser")} · {new Date(item.updatedAt).toLocaleString(locale)}</p></div><div className={css.actions}><button title={t("お気に入り", "Favorite")} aria-label={`${item.title} ${t("お気に入り", "favorite")}`} aria-pressed={item.metadata.favorite} onClick={() => void capsuleMetadata(item.key, { favorite: !item.metadata.favorite }).then(metadata => setItems(values => values.map(v => v.key === item.key ? { ...v, metadata } : v))).catch(() => setError(t("お気に入りを保存できませんでした。", "Could not save favorite.")))}><Icon name="star" style={item.metadata.favorite ? {fill:"currentColor"} : undefined} /></button><button disabled={busy} onClick={() => void open(item)}>{t("開く", "Open")}</button>{item.browser && identity.user && <button disabled={busy} onClick={() => void (async () => { setBusy(true); try { const { memberImportRequest } = await import("../lib/client/member-api"); const request = memberImportRequest(sessionStorage, identity.user!.id, item.browser!); await memberRequest("/api/member/capsules", memberCreateResultSchema, { method: "POST", body: request, user: identity.user!.id }); setAttempt(v => v + 1); } catch { setError(t("保存できませんでした。元のブラウザ保存は保持しています。", "Could not save. The browser copy is retained.")); } finally { setBusy(false); } })()}>{t("アカウントに保存", "Save to account")}</button>}</div></li>)}</ul>
    </div>
  </dialog>{opened && <CapsuleWorkspace key={`${opened.capsule.id}:${opened.owner ?? "browser"}`} initial={opened.capsule} member={opened.member} ownerId={opened.owner} onClose={() => { setOpened(null); setAttempt(v => v + 1); }} />}</>;
}
