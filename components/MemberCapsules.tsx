"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { DatasetMode } from "../lib/domain/dataset";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsulesKey, readCapsules, type LocalCapsule } from "../lib/client/local-capsules";
import { MemberClientError, memberCreateResultSchema, memberImportRequest, memberItemSchema, memberListSchema, memberProfileSchema, memberReaderCapsule, memberRequest, type MemberUser } from "../lib/client/member-api";
import { memberLabels } from "../lib/i18n/member";
import { datasetLabels } from "../lib/i18n/dataset";
import { capsuleLabels } from "../lib/i18n/capsules";
import MemberCapsuleEditor from "./MemberCapsuleEditor";
import CapsuleShareControls from "./CapsuleShareControls";
import CapsuleRevisionList from "./CapsuleRevisionList";
import CapsuleComparison from "./CapsuleComparison";
import MemberPosts from "./MemberPosts";
import { capsuleHistoryLabels } from "../lib/i18n/capsule-history";
import CapsuleDiscussion, { useDiscussionDraft } from "./CapsuleDiscussion";
import { memberDraftContent, sameMemberContent, type MemberCapsuleDraft } from "../lib/client/member-capsule-edit";
import { CapsuleReader } from "./CapsuleDialog";
import css from "./MemberCapsules.module.css";
import capsuleCss from "./CapsuleDialog.module.css";

const authEventKey = "graph-knowledge:member-session-changed";
export default function MemberCapsules({ dataset, initialImport = "" }: { dataset: DatasetMode; initialImport?: string }) {
  const text = memberLabels(), captions = capsuleLabels(), historyText = capsuleHistoryLabels();
  const [user, setUser] = useState<MemberUser | null>(null);
  const [provider, setProvider] = useState<"google" | "fixture" | null>(null);
  const [items, setItems] = useState<MemberCapsule[]>([]);
  const [selected, setSelected] = useState<MemberCapsule | null>(null);
  const [historical, setHistorical] = useState(false);
  const [local, setLocal] = useState<LocalCapsule[]>([]);
  const [sourceId, setSourceId] = useState(initialImport);
  const [localError, setLocalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [confirm, setConfirm] = useState<"remove" | "logoutAll" | "discard" | null>(null);
  const [draft, setDraftState] = useState<MemberCapsuleDraft | null>(null);
  const draftRef = useRef<MemberCapsuleDraft | null>(null);
  const setDraft = useCallback((value: MemberCapsuleDraft | null) => { draftRef.current = value; setDraftState(value); }, []);
  const active = useRef<AbortController | null>(null);
  const discussionDraft = useDiscussionDraft();
  const heading = useRef<HTMLHeadingElement>(null);
  const source = local.find(value => value.id === sourceId);
  const reading = useMemo(() => selected ? memberReaderCapsule(selected, dataset) : null, [selected, dataset]);
  const clearPrivate = useCallback(() => { setUser(null); setItems([]); setSelected(null); setHistorical(false); setConfirm(null); }, []);
  const fail = useCallback((cause: unknown) => {
    if (cause instanceof MemberClientError) {
      if (cause.status === 401) { clearPrivate(); setError(text.expired); return; }
      if (cause.status === 503) setProvider(null);
      setError(cause.status === 503 ? text.unavailable : cause.status === 404 ? text.notFound : cause.status === 409 ? text.conflict : cause.code === "CAPSULE_LIMIT" ? text.limit : text.failed);
    } else setError(text.failed);
  }, [clearPrivate, text]);
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setMessage(null); setConfirm(null);
    try { await action(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) fail(cause); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [fail]);
  const refresh = useCallback(() => {
    clearPrivate(); setProvider(null);
    // A storage notification may arrive while this tab is hidden. Keep private
    // content out of the DOM until visibility restoration reauthorizes it.
    if (document.visibilityState === "hidden") { active.current?.abort(); setBusy(true); return; }
    void run(async signal => {
      const status = await memberRequest("/api/member/status", z.object({ provider: z.enum(["google", "fixture"]) }), { signal });
      if (signal.aborted) return;
      setProvider(status.provider);
      let profile;
      try { profile = await memberRequest("/api/member/profile", memberProfileSchema, { signal }); }
      catch (cause) { if (cause instanceof MemberClientError && cause.status === 401) { if (!signal.aborted && new URL(location.href).searchParams.has("error")) setError(text.loginFailed); return; } throw cause; }
      const result = await memberRequest("/api/member/capsules", memberListSchema, { user: profile.user.id, signal });
      for (const item of result.capsules) memberReaderCapsule(item, dataset);
      if (signal.aborted) return;
      setUser(profile.user); setItems(result.capsules);
      const id = new URL(location.href).searchParams.get("capsule");
      const query = new URL(location.href).searchParams;
      const revision = query.get("revision");
      if (query.getAll("revision").length > 1 || (revision !== null && (!/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision))))) throw new MemberClientError(400, "INVALID_ARGUMENT");
      let opened: MemberCapsule | null = null;
      if (id && z.uuidv4().safeParse(id).success) {
        // Always authorize the current read; a list snapshot is not permission.
        opened = (await memberRequest(`/api/member/capsules/${id}${revision === null ? "" : `/revisions?revision=${revision}`}`, memberItemSchema, { user: profile.user.id, signal })).capsule;
        memberReaderCapsule(opened, dataset);
        if (opened.id !== id.toLowerCase() || (revision !== null && opened.revision !== Number(revision))) throw new Error("Context mismatch");
      }
      if (signal.aborted) return;
      setUser(profile.user); setItems(result.capsules); setSelected(opened); setHistorical(revision !== null);
      const retained = draftRef.current;
      if (retained && retained.ownerId === profile.user.id && opened?.id === retained.base.id) setDraft({ ...retained, needsCheck: false });
    });
  }, [clearPrivate, dataset, run, setDraft, text.loginFailed]);
  useEffect(() => {
    const readLocal = () => {
      try { setLocal(readCapsules(localStorage, dataset)); setLocalError(null); }
      catch { setLocal([]); setLocalError(text.localError); }
    };
    // Defer browser/session synchronization until hydration has committed.
    const initial = window.setTimeout(() => { readLocal(); refresh(); }, 0);
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === capsulesKey(dataset)) readLocal();
      if (event.key === authEventKey || event.key === null) refresh();
    };
    // Hide private content on leaving the tab. Reauthorize on return, including
    // bfcache restoration and account changes made by another tab.
    const visibility = () => {
      if (document.visibilityState === "hidden") { active.current?.abort(); clearPrivate(); setBusy(true); }
      else refresh();
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) refresh(); };
    window.addEventListener("storage", changed); document.addEventListener("visibilitychange", visibility); window.addEventListener("pageshow", restored);
    return () => { window.clearTimeout(initial); active.current?.abort(); window.removeEventListener("storage", changed); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pageshow", restored); };
  }, [dataset, refresh, clearPrivate, text]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  function navigate(id: string | null, revision?: number) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("capsule", id); else url.searchParams.delete("capsule");
    if (id && revision !== undefined) url.searchParams.set("revision", String(revision)); else url.searchParams.delete("revision");
    history.replaceState(null, "", url);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function signalAuthChange() { try { localStorage.setItem(authEventKey, crypto.randomUUID()); } catch { /* Refresh on tab return still reauthorizes. */ } }
  function logout(all: boolean) {
    void run(async signal => {
      await memberRequest(all ? "/api/auth/revoke-sessions" : "/api/auth/sign-out", z.unknown(), { method: "POST", body: {}, user: user?.id, signal });
      if (signal.aborted) return;
      clearPrivate(); navigate(null); signalAuthChange();
    });
  }
  function login() {
    if (!provider) return;
    void run(async signal => {
      const callback = new URL(location.href); callback.searchParams.delete("error");
      const result = await memberRequest("/api/auth/sign-in/social", z.object({ url: z.url() }), { method: "POST", body: { provider, callbackURL: callback.pathname + callback.search, disableRedirect: true }, signal });
      if (!signal.aborted) location.assign(result.url);
    });
  }
  function save() {
    if (!source || !user) return;
    let body;
    try { body = memberImportRequest(sessionStorage, user.id, source); }
    catch { setError(text.receiptError); return; }
    void run(async signal => {
      const result = await memberRequest("/api/member/capsules", memberCreateResultSchema, { method: "POST", body, user: user.id, signal });
      memberReaderCapsule(result.capsule, dataset);
      if (signal.aborted) return;
      setItems(previous => [result.capsule, ...previous.filter(item => item.id !== result.capsule.id)]);
      setSelected(result.capsule); setHistorical(false); setMessage(result.replayed ? text.replayed : text.saved); navigate(result.capsule.id);
    });
  }
  function read(id: string, revision?: number) {
    if (!user) return;
    setSelected(null); navigate(id, revision);
    void run(async signal => {
      const result = await memberRequest(`/api/member/capsules/${id}${revision === undefined ? "" : `/revisions?revision=${revision}`}`, memberItemSchema, { user: user.id, signal });
      memberReaderCapsule(result.capsule, dataset);
      if (result.capsule.id !== id || (revision !== undefined && result.capsule.revision !== revision)) throw new Error("Context mismatch");
      if (!signal.aborted) { setSelected(result.capsule); setHistorical(revision !== undefined); }
    });
  }
  function update() {
    if (historical || !user || !selected || !draft || draft.ownerId !== user.id || draft.needsCheck || selected.id !== draft.base.id || selected.revision !== draft.expected.revision) return;
    let content;
    try { content = memberDraftContent(draft); } catch { setError(text.failed); return; }
    if (sameMemberContent(draft.expected.content, content)) return;
    void run(async signal => {
      try {
        const result = await memberRequest(`/api/member/capsules/${draft.base.id}`, memberItemSchema, { method: "PUT", body: { expectedRevision: draft.expected.revision, content }, user: draft.ownerId, signal });
        memberReaderCapsule(result.capsule, dataset);
        if (signal.aborted) return;
        setItems(previous => previous.map(item => item.id === result.capsule.id ? result.capsule : item));
        setSelected(result.capsule); setDraft(null); setMessage(text.edited); navigate(result.capsule.id);
      } catch (cause) {
        if (!signal.aborted) setDraft({ ...draft, needsCheck: true });
        throw cause;
      }
    });
  }
  function cancelEdit() { setConfirm(null); setDraft(null); setError(null); setMessage(null); navigate(selected?.id ?? null); }
  function remove() {
    if (historical || !user || !selected) return;
    void run(async signal => {
      await memberRequest(`/api/member/capsules/${selected.id}`, z.object({ deleted: z.literal(true) }), { method: "DELETE", body: { expectedRevision: selected.revision }, user: user.id, signal });
      if (!signal.aborted) { setItems(previous => previous.filter(item => item.id !== selected.id)); setSelected(null); setMessage(text.removed); navigate(null); }
    });
  }
  return <main className={css.page}>
    <header><p className={css.eyebrow}>{text.private}</p><h1 ref={heading} tabIndex={-1}>{text.title}</h1><p>{datasetLabels(dataset).badge}</p><p>{text.help}</p>
      <a href="/" target="_blank" rel="noopener noreferrer">{text.explorer}</a><p className={css.muted}>{text.returnHelp}</p>
    </header>
    <section className={css.account} aria-label={text.title}>
      {user ? <><p><strong>{user.name}</strong> · {user.locale}</p><button disabled={busy || !!draft} onClick={() => logout(false)}>{text.logout}</button><button disabled={busy || !!draft} onClick={() => setConfirm("logoutAll")}>{text.logoutAll}</button></> : !busy && provider && <><p>{text.loggedOut}</p><button disabled={!!draft} onClick={login}>{provider === "fixture" ? text.fixtureLogin : text.login}</button></>}
      <button disabled={busy} onClick={refresh}>{text.refresh}</button>
      {draft && <p>{text.editingAccountHelp}</p>}
      {busy && <p role="status">{user ? text.busy : text.checking}</p>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      {confirm === "logoutAll" && <div role="alert"><p>{text.logoutAllConfirm}</p><button onClick={() => logout(true)}>{text.confirmLogoutAll}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
    </section>
    {user && <MemberPosts key={user.id} userId={user.id} onUnauthorized={() => { active.current?.abort(); setBusy(false); fail(new MemberClientError(401, "UNAUTHENTICATED")); }} />}
    {draft && user?.id !== draft.ownerId && <section className={css.card} aria-label={text.editTitle}>
      <p role="status">{text.draftLocked}</p><p>{text.draftMemory}</p>
      <a href="/member" target="_blank" rel="noopener noreferrer">{text.reauthenticate}</a>
      <button disabled={busy} onClick={() => setConfirm("discard")}>{text.discardLocked}</button>
      {confirm === "discard" && <div role="alert"><p>{text.discardLockedConfirm}</p><button onClick={cancelEdit}>{captions.discard}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
    </section>}
    {user && <section className={css.card} aria-label={text.library}>
      {draft && user.id === draft.ownerId ? <MemberCapsuleEditor draft={draft} current={selected} busy={busy} onChange={setDraft} onSave={update} onCancel={cancelEdit} onCheck={refresh} /> : selected && reading ? <><button disabled={busy} onClick={() => { setSelected(null); setConfirm(null); navigate(null); }}>{text.back}</button>
        {historical && <div role="status"><h2>{historyText.reading(selected.revision)}</h2><p>{historyText.snapshotHelp}</p><button disabled={busy} onClick={() => read(selected.id)}>{historyText.current}</button></div>}
        <CapsuleRevisionList key={`revisions:${selected.id}:${selected.revision}:${user.id}`} capsuleId={selected.id} userId={user.id} disabled={busy} onRead={revision => read(selected.id, revision)} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />
        {historical && <CapsuleComparison key={`comparison:${selected.id}:${selected.revision}:${user.id}`} snapshot={selected} userId={user.id} disabled={busy} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />}
        <CapsuleReader key={`${selected.id}:${selected.revision}`} capsule={reading} explorationLinks onEdit={!historical && !busy && !draft ? resolved => {
          setDraft({ ownerId: user.id, base: selected, expected: selected, content: selected.content, resolved, needsCheck: false }); setError(null); setMessage(null);
        } : undefined} />
        {!historical && <CapsuleShareControls key={`share:${selected.id}:${selected.revision}`} capsule={selected} userId={user.id} disabled={busy} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />}
        <CapsuleDiscussion key={`discussion:${selected.id}:${selected.revision}:${user.id}`} capsuleId={selected.id} revision={selected.revision} userId={user.id} draftCache={discussionDraft} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />
        {!historical && <button disabled={busy} onClick={() => setConfirm("remove")}>{text.remove}</button>}
        {!historical && confirm === "remove" && <div role="alert"><p>{text.removeHelp}</p><button onClick={remove}>{text.removeConfirm}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
      </> : <><h2>{text.library}</h2><p>{items.length} / 10</p>{!items.length && <p>{text.empty}</p>}
        <ul className={capsuleCss.library}>{items.map(item => <li key={item.id}><h3>{item.content.title}</h3><p>{captions.version(item.revision)} · {captions.selected(item.content.entityIds.length, item.content.claimIds.length)}</p><button disabled={busy || !!draft} onClick={() => read(item.id)}>{text.read}</button></li>)}</ul></>}
    </section>}
    <section className={css.card} aria-label={text.localTitle}>
      <h2>{text.localTitle}</h2><p>{text.localHelp}</p>
      {localError && <p role="alert">{localError}</p>}
      {!local.length && !localError && <p>{text.noLocal}</p>}
      {sourceId && !source && !localError && <p role="status">{text.missingLocal}</p>}
      {!!local.length && <div className={css.source}><label htmlFor="member-local-source">{text.source}</label><select id="member-local-source" value={sourceId} disabled={busy} onChange={event => {
        setSourceId(event.target.value); const url = new URL(location.href);
        if (event.target.value) url.searchParams.set("import", event.target.value); else url.searchParams.delete("import"); history.replaceState(null, "", url); setMessage(null);
      }}><option value="">{text.choose}</option>{local.map(item => <option key={item.id} value={item.id}>{item.title} · {captions.version(item.revision)}</option>)}</select></div>}
      {source && <><p className={css.eyebrow}>{text.local}</p><h3>{source.title}</h3><p className={capsuleCss.note}>{source.note || captions.noNote}</p><p>{captions.selected(source.entityIds.length, source.claimIds.length)} · {captions.version(source.revision)}</p>
        <button disabled={busy || !user || !!draft} onClick={save}>{text.save}</button></>}
    </section>
  </main>;
}
