"use client";
import PageIdentity from "./PageIdentity";
import {useMemberSession,refreshMemberIdentity} from "../lib/client/use-member-identity";
import {usePersonalHash} from "../lib/client/personal-location";
import {PersonalMemberControls} from "./PersonalFrame";

import {useCommunitiesEnabled} from "./CommunityAvailability";
import { focusDestination } from "../lib/client/focus-destination";
import { useUiLocale } from "../lib/client/ui-locale";
import { contentMessage } from "../lib/i18n/content";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { DatasetMode } from "../lib/domain/dataset";
import type { MemberCapsule } from "../lib/domain/member-capsule";
import { capsulesKey, readCapsules, type LocalCapsule } from "../lib/client/local-capsules";
import { MemberClientError, memberCreateResultSchema, memberImportRequest, memberItemSchema, memberListSchema, memberReaderCapsule, memberRequest, type MemberUser, type MemberCapsuleSummary } from "../lib/client/member-api";
import { memberLabels } from "../lib/i18n/member";
import Icon from "./Icon";
import AnimatedDetails from "./AnimatedDetails";
import { notifyMemberSessionChange } from "../lib/client/account-navigation";
import MemberAccountDeletion from "./MemberAccountDeletion";
import MemberProfileSettings from "./MemberProfileSettings";
import {usePublicProfilesEnabled} from './PublicProfileAvailability';
import PublicProfileEditor from "./PublicProfileEditor";
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
import { CapsuleWorkspace } from "./MyCapsules";
import css from "./MemberCapsules.module.css";
import capsuleCss from "./CapsuleDialog.module.css";

const authEventKey = "graph-knowledge:member-session-changed";
const textMessages = memberLabels();
export default function MemberCapsules({ dataset, initialImport = "" }: { dataset: DatasetMode; initialImport?: string }) {
  const communitiesEnabled=useCommunitiesEnabled();
  const { locale } = useUiLocale();
  const text = memberLabels(locale), captions = capsuleLabels(locale), historyText = capsuleHistoryLabels(locale);
  const identity=useMemberSession(),hash=usePersonalHash();
  const profilesEnabled=usePublicProfilesEnabled();
  const profileOwner=identity.status==="authenticated"&&!identity.error?identity.user:null;
  const [publicProfileDirty,setPublicProfileDirty]=useState(false);
  const section=publicProfileDirty?"profile":hash==="profile"?"profile":hash==="account-settings"?"settings":hash==="my-posts"?"posts":"saved";
  const [readingTab, setReadingTab] = useState<"content" | "sharing">("content");
  const [loadedUser, setUser] = useState<MemberUser | null>(null);
  const user=identity.status==='authenticated'&&identity.user?.id===loadedUser?.id?loadedUser:null;
  const [profileDraft, setProfileDraft] = useState<{ ownerId: string; name: string } | null>(null);
  const [provider, setProvider] = useState<"google" | "fixture" | null>(null);
  const [items, setItems] = useState<MemberCapsuleSummary[]>([]);
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
      if (cause.status === 401) { void refreshMemberIdentity(true).catch(()=>{}); clearPrivate(); setError(textMessages.expired); return; }
      if (cause.status === 503) setProvider(null);
      setError(cause.status === 503 ? textMessages.unavailable : cause.status === 404 ? textMessages.notFound : cause.status === 409 ? textMessages.conflict : cause.code === "CAPSULE_LIMIT" ? textMessages.limit : textMessages.failed);
    } else setError(textMessages.failed);
  }, [clearPrivate]);
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<void>) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setMessage(null); setConfirm(null);
    try { await action(controller.signal); }
    catch (cause) { if (!controller.signal.aborted) fail(cause); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [fail]);
  const refresh = useCallback((force=true) => {
    clearPrivate(); setProvider(null);
    // A storage notification may arrive while this tab is hidden. Keep private
    // content out of the DOM until visibility restoration reauthorizes it.
    if (document.visibilityState === "hidden") { active.current?.abort(); setBusy(true); return; }
    void run(async signal => {
      const status = await memberRequest("/api/member/status", z.object({ provider: z.enum(["google", "fixture"]) }), { signal });
      if (signal.aborted) return;
      setProvider(status.provider);
      const identityUser=await refreshMemberIdentity(force);
      if(!identityUser){if(!signal.aborted&&new URL(location.href).searchParams.has("error"))setError(textMessages.loginFailed);return;}
      const profile={user:identityUser};
      const result = await memberRequest("/api/member/capsules", memberListSchema, { user: profile.user.id, signal });
      // The list contains validated summaries, not complete documents. Only
      // detail/revision responses can be passed to memberReaderCapsule.
      for (const item of result.capsules) {
        if (item.content.dataset !== dataset) throw new Error("Dataset mismatch");
      }
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
      setUser(profile.user); setItems(result.capsules); setSelected(opened); setHistorical(revision !== null); setReadingTab(revision === null && query.get("manage") === "sharing" ? "sharing" : "content");
      const retained = draftRef.current;
      if (retained && retained.ownerId === profile.user.id && opened?.id === retained.base.id) setDraft({ ...retained, needsCheck: false });
    });
  }, [clearPrivate, dataset, run, setDraft]);
  useEffect(() => {
    const readLocal = () => {
      try { setLocal(readCapsules(localStorage, dataset)); setLocalError(null); }
      catch { setLocal([]); setLocalError(textMessages.localError); }
    };
    // Defer browser/session synchronization until hydration has committed.
    const initial = window.setTimeout(() => { readLocal(); refresh(false); }, 0);
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
  }, [dataset, refresh, clearPrivate,identity.version]);
  useEffect(() => {
    const sync = () => {
      requestAnimationFrame(() => { focusDestination(heading.current); window.scrollTo({ top: 0 }); });
    };
    const initial = setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    return () => { clearTimeout(initial); window.removeEventListener("hashchange", sync); };
  }, []);
  useEffect(() => {
    if (!draft && !profileDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft, profileDraft]);
  function navigate(id: string | null, revision?: number, sharing = false) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("capsule", id); else url.searchParams.delete("capsule");
    if (id && revision !== undefined) url.searchParams.set("revision", String(revision)); else url.searchParams.delete("revision");
    if (sharing) url.searchParams.set("manage", "sharing"); else url.searchParams.delete("manage");
    history.replaceState(history.state, "", url);
    requestAnimationFrame(() => focusDestination(heading.current, {}));
  }
  useEffect(() => {
    if (!user || busy || error) return;
    const value = new URLSearchParams(location.search).get('returnTo');
    if (!value) return;
    try { const target = new URL(value, location.origin); if (target.origin === location.origin && (target.pathname === '/communities' || target.pathname === '/following' || /^\/(?:en\/)?people\/[a-z][a-z0-9-]{2,29}$/.test(target.pathname)) && !target.search && !target.username && !target.password) location.replace(target.pathname + target.hash); } catch { /* Invalid return targets never navigate. */ }
  }, [user, busy, error]);
  function signalAuthChange() { notifyMemberSessionChange(); }
  function logout(all: boolean) {
    void run(async signal => {
      await memberRequest(all ? "/api/auth/revoke-sessions" : "/api/auth/sign-out", z.unknown(), { method: "POST", body: {}, user: user?.id, signal });
      if (signal.aborted) return;
      clearPrivate(); navigate(null); signalAuthChange();
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-signed-in="false"]')?.focus());
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
      setSelected(result.capsule); setHistorical(false); setReadingTab("content"); setMessage(result.replayed ? text.replayed : text.saved); navigate(result.capsule.id);
    });
  }
  function read(id: string, revision?: number, sharing = false) {
    if (!user) return;
    setSelected(null); setReadingTab(sharing ? "sharing" : "content"); navigate(id, revision, sharing);
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
  const title = identity.status==='guest' ? text.loginTitle : hash===null||identity.status==='checking' ? text.checking : section === "profile" ? (locale==='en'?'Edit profile':'プロフィールを編集') : section === "settings" ? text.settings : section === "posts" ? text.postsTitle : text.savedTitle;
  return <><PersonalMemberControls logout={() => logout(false)} busy={busy || !!draft || !!profileDraft || publicProfileDirty} guard={()=>!(draft||profileDraft)||window.confirm(locale==='en'?'Leave without saving this draft?':'未保存の入力を破棄して移動しますか？')} /><main lang={locale} className={css.page}>
    <div className={communitiesEnabled?undefined:css.memberLayout}>
    {user && !communitiesEnabled && <nav className={css.memberNavigation} aria-label={text.navigation}>
      <a href="#my-capsules" aria-current={section === "saved" ? "page" : undefined}><Icon name="capsule" />{text.savedTitle}</a>
      <a href="#account-settings" aria-current={section === "settings" ? "page" : undefined}><Icon name="person" />{text.settings}</a>
      <a href="#my-posts" aria-current={section === "posts" ? "page" : undefined}><Icon name="book" />{text.postsTitle}</a>
      {communitiesEnabled&&<a href="/communities#%3Fmine%3D1">{locale==="en"?"Joined & managed":"参加・運営"}</a>}
    </nav>}
    <div className={css.memberContent}>
    <header className={css.pageHeader}><PageIdentity area={section==="posts"?"activity":"account"}/><h1 ref={heading} tabIndex={-1} data-focus-destination>{title}</h1><p>{(section==="profile"?profileOwner:user) ? section === "profile" ? (locale==='en'?'Your public identity across Plunode.':'Plunodeで共通の、あなたの公開プロフィール。') : section === "settings" ? text.settingsHelp : section === "posts" ? text.postsHelp : text.savedHelp : identity.status==='guest'?text.loggedOut:identity.error?(locale==='en'?'Account verification failed. Retry below.':'認証を確認できませんでした。再試行してください。'):text.checking}</p></header>
    <section id="member-login" className={user ? css.feedback : css.account} aria-label={text.title}>
      {identity.status==='guest'&&profilesEnabled&&<p>{locale==='en'?'Your profile is prepared automatically. Your Google name may be its initial display name; you can change it immediately. Email and Google photo are not displayed.':'プロフィールは自動で準備されます。Google等の名前が表示名の初期値になる場合があり、すぐに変更できます。メールとGoogle画像は表示しません。'}</p>}
      {identity.status==='guest' && !busy && provider && <button data-variant="primary" disabled={!!draft} onClick={login}>{provider === "fixture" ? text.fixtureLogin : text.login}</button>}
      <button className={css.refresh} title={locale==="en"?"Recheck your account and saved data without discarding your draft":"入力を保持したまま、アカウントと保存データを再取得します"} disabled={busy} onClick={()=>refresh()}><Icon name="refresh" />{text.refresh}</button>
      {draft && <p>{text.editingAccountHelp}</p>}
      {busy && <p role="status">{user ? text.busy : text.checking}</p>}
      {error && <p role="alert">{contentMessage(error, locale)}</p>}{message && <p role="status">{contentMessage(message, locale)}</p>}
      {confirm === "logoutAll" && <div role="alert"><p>{text.logoutAllConfirm}</p><button onClick={() => logout(true)}>{text.confirmLogoutAll}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
    </section>
    {profileOwner && section === "profile" && <PublicProfileEditor key={`public-profile:${profileOwner.id}`} user={profileOwner} onDirtyChange={setPublicProfileDirty}/>}
    <div hidden={section !== "settings"}>

    {user && !profilesEnabled && (section === "settings" || !!profileDraft) && <MemberProfileSettings key={`profile:${user.id}`} user={user} value={profileDraft?.ownerId === user.id ? profileDraft.name : user.name} disabled={busy}
      onChange={name => setProfileDraft(name === null || name === user.name ? null : { ownerId: user.id, name })}
      onSaved={updated => { setUser(current => current?.id === updated.id ? updated : current); setProfileDraft(null); signalAuthChange(); }}
      onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />}
    {user && section === "settings" && <section className={css.card} aria-label={text.sessionTitle}><h2>{text.sessionTitle}</h2><p>{text.accountNavigationHelp}</p>
      <div className={css.actions}><button disabled={busy || !!draft || !!profileDraft} onClick={() => logout(false)}>{text.logout}</button><button disabled={busy || !!draft || !!profileDraft} onClick={() => setConfirm("logoutAll")}>{text.logoutAll}</button></div>
    </section>}
    {user && section === "settings" && <MemberAccountDeletion key={`deletion:${user.id}`} user={user} disabled={busy || !!draft || !!profileDraft}
      onDeleted={() => { active.current?.abort(); clearPrivate(); setDraft(null); setProfileDraft(null); setBusy(false); setError(null); setMessage(text.accountDeleted); navigate(null); signalAuthChange(); }}
      onUnauthorized={() => { active.current?.abort(); setBusy(false); fail(new MemberClientError(401, "UNAUTHENTICATED")); }} />}
    </div>
    <div hidden={section !== "posts"}>
    {user && section === "posts" && <MemberPosts initiallyOpen key={user.id} userId={user.id} onUnauthorized={() => { active.current?.abort(); setBusy(false); fail(new MemberClientError(401, "UNAUTHENTICATED")); }} />}
    </div>
    <div hidden={section !== "saved"}>
    {draft && user?.id !== draft.ownerId && <section className={css.card} aria-label={text.editTitle}>
      <p role="status">{text.draftLocked}</p><p>{text.draftMemory}</p>
      <a href="/member" target="_blank" rel="noopener noreferrer">{text.reauthenticate}</a>
      <button disabled={busy} onClick={() => setConfirm("discard")}>{text.discardLocked}</button>
      {confirm === "discard" && <div role="alert"><p>{text.discardLockedConfirm}</p><button onClick={cancelEdit}>{captions.discard}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
    </section>}
    {user && <section id="my-capsules" className={css.card} aria-label={text.library}>
      {draft && user.id === draft.ownerId ? <MemberCapsuleEditor draft={draft} current={selected} busy={busy} onChange={setDraft} onSave={update} onCancel={cancelEdit} onCheck={refresh} /> : selected && reading ? <><button disabled={busy} onClick={() => { setSelected(null); setConfirm(null); navigate(null); }}>{text.back}</button>
        {!historical && <nav className={css.readingTabs} aria-label={selected.content.title}>
          <button aria-pressed={readingTab === "content"} onClick={() => { setReadingTab("content"); navigate(selected.id); }}>{text.contentTab}</button>
          <button aria-pressed={readingTab === "sharing"} onClick={() => { setReadingTab("sharing"); navigate(selected.id, undefined, true); }}>{text.sharingTab}</button>
          {communitiesEnabled&&<a href="/communities#%3Fmine%3D1">{locale==="en"?"Joined & managed":"参加・運営"}</a>}
    </nav>}
        <div hidden={readingTab !== "content"}>
        {historical && <div role="status"><h2>{historyText.reading(selected.revision)}</h2><p>{historyText.snapshotHelp}</p><button disabled={busy} onClick={() => read(selected.id)}>{historyText.current}</button></div>}
        <CapsuleRevisionList key={`revisions:${selected.id}:${selected.revision}:${user.id}`} capsuleId={selected.id} userId={user.id} disabled={busy} onRead={revision => read(selected.id, revision)} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />
        {historical && <CapsuleComparison key={`comparison:${selected.id}:${selected.revision}:${user.id}`} snapshot={selected} userId={user.id} disabled={busy} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />}
        {reading.document && !historical ? <CapsuleWorkspace key={`workspace:${selected.id}`} initial={reading} member={selected} ownerId={user.id} onSaved={value => { setSelected(value); setItems(items => items.map(item => item.id === value.id ? value : item)); }} /> : <CapsuleReader key={`${selected.id}:${selected.revision}`} capsule={reading} explorationLinks onEdit={!historical && !busy && !draft ? resolved => {
          setDraft({ ownerId: user.id, base: selected, expected: selected, content: selected.content, resolved, needsCheck: false }); setError(null); setMessage(null);
        } : undefined} />}
        </div>
        <div hidden={readingTab !== "sharing"}>
        {!historical && <CapsuleShareControls key={`share:${selected.id}:${selected.revision}`} capsule={selected} userId={user.id} disabled={busy} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />}
        </div>
        <div hidden={readingTab !== "content"}>
        <CapsuleDiscussion key={`discussion:${selected.id}:${selected.revision}:${user.id}`} capsuleId={selected.id} revision={selected.revision} userId={user.id} draftCache={discussionDraft} onUnauthorized={() => fail(new MemberClientError(401, "UNAUTHENTICATED"))} />
        {!historical && <button disabled={busy} onClick={() => setConfirm("remove")}>{text.remove}</button>}
        {!historical && confirm === "remove" && <div role="alert"><p>{text.removeHelp}</p><button onClick={remove}>{text.removeConfirm}</button><button onClick={() => setConfirm(null)}>{text.cancel}</button></div>}
        </div>
      </> : <><div className={css.listHeading}><span className={css.listCaption}>{locale === "en" ? "Saved in your account" : "アカウントに保存"}</span><span className={css.count}>{items.length} / 100</span></div>{!items.length && <p>{text.empty}</p>}
        <ul className={css.savedList}>{items.map(item => <li key={item.id}><div><h3>{item.content.title}</h3><p>{captions.version(item.revision)} · {captions.selected(item.content.entityIds.length, item.content.claimIds.length)}</p></div><div className={css.actions}><button disabled={busy || !!draft} onClick={() => read(item.id)}>{text.read}</button><button disabled={busy || !!draft} onClick={() => read(item.id, undefined, true)}>{text.manageShare}</button></div></li>)}</ul></>}
    </section>}
    <AnimatedDetails className={`${css.card} ${css.importPanel}`} bodyClassName={css.importBody} open={!!sourceId} summary={<>{text.importReview}<Icon name="chevron" /></>}>
    <section aria-label={text.localTitle}>
      <h2>{text.localTitle}</h2><p>{text.localHelp}</p>
      {localError && <p role="alert">{contentMessage(localError, locale)}</p>}
      {!local.length && !localError && <p>{text.noLocal}</p>}
      {sourceId && !source && !localError && <p role="status">{text.missingLocal}</p>}
      {!!local.length && <div className={css.source}><label htmlFor="member-local-source">{text.source}</label><select id="member-local-source" value={sourceId} disabled={busy} onChange={event => {
        setSourceId(event.target.value); const url = new URL(location.href);
        if (event.target.value) url.searchParams.set("import", event.target.value); else url.searchParams.delete("import"); history.replaceState(history.state, "", url); setMessage(null);
      }}><option value="">{text.choose}</option>{local.map(item => <option key={item.id} value={item.id}>{item.title} · {captions.version(item.revision)}</option>)}</select></div>}
      {source && <><p className={css.eyebrow}>{text.local}</p><h3>{source.title}</h3><p className={capsuleCss.note}>{source.note || captions.noNote}</p><p>{captions.selected(source.entityIds.length, source.claimIds.length)} · {captions.version(source.revision)}</p>
        <button disabled={busy || !user || !!draft} onClick={save}>{text.save}</button></>}
    </section>
    </AnimatedDetails>
    </div>
    </div></div>
  </main></>;
}
