"use strict";

const $ = (id) => document.getElementById(id);
const languageName = { ja: "日本語", en: "English" };
const productionLanguage = { ja: "日本語", en: "英語", both: "日英" };
const effortName = { low: "低", medium: "中", high: "高", xhigh: "XHigh", max: "Max", ultra: "Ultra" };
const modelForms = ["new", "rerun", "adapt"];
const jobName = { queued: "待機中", running: "生成中", done: "完了", failed: "失敗", interrupted: "中断", script_ready: "台本確認" };
const pending = (run) => ["queued", "running"].includes(run.status);
const state = {
  models: [], cases: [], detail: null, lang: "ja", chosen: null, results: [],
  selected: { ja: "", en: "" }, sceneId: "", compare: false, compareKey: "",
  poll: null, routeVersion: 0, searchVersion: 0, resumeAfter: null, editTarget: null, reviewTarget: null,
  readingRequest: null, readingUrl: null, adaptTarget: null, awaitingEnglishFor: "",
};

function node(tag, value, className) {
  const el = document.createElement(tag);
  if (value !== undefined && value !== null) el.textContent = String(value);
  if (className) el.className = className;
  return el;
}

function option(id, label) {
  const el = node("option", label);
  el.value = id;
  return el;
}

function safeUrl(value, localOnly = false) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value, location.origin);
    if (!["http:", "https:"].includes(url.protocol) || (localOnly && url.origin !== location.origin)) return null;
    return url.href;
  } catch { return null; }
}

function externalLink(value, label) {
  const url = safeUrl(value);
  if (!url) return node("span", label);
  const a = node("a", label);
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  return a;
}

async function api(path, data) {
  const options = { cache: "no-store", credentials: "same-origin" };
  if (data !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(data);
  }
  const response = await fetch(path, options);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "通信に失敗しました（" + response.status + "）");
  return value;
}

function notify(message = "", error = false, retry) {
  const box = $("notice");
  box.hidden = !message;
  box.classList.toggle("error", error);
  box.replaceChildren(node("span", message));
  if (retry) {
    const button = node("button", "再読み込み", "secondary small");
    button.type = "button"; button.onclick = retry;
    box.append(button);
  }
}

function detailPath(suffix = "") { return "/api/cases/" + encodeURIComponent(state.detail.id) + suffix; }
function caseHash(id) { return "#case/" + encodeURIComponent(id); }
function trim(value) { return String(value ?? "").trim(); }
function millis(value) {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  return Date.parse(value || "") || 0;
}
function when(value) {
  const t = millis(value);
  return t ? new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(t) : "";
}
function clock(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

function renderNav() {
  const list = $("case-list");
  $("case-count").textContent = state.cases.filter((c) => !c.reference).length;
  const nodes = [];
  for (const sample of [false, true]) {
    const group = state.cases.filter((c) => Boolean(c.reference) === sample);
    if (!group.length) {
      if (!sample) nodes.push(node("p", "制作中の案件はまだありません。", "aside-empty"));
      continue;
    }
    if (sample) nodes.push(node("p", "品質の見本", "side-label"));
    for (const data of group) {
      const a = node("a", null, "case-nav");
      a.href = caseHash(data.id);
      if (state.detail?.id === data.id && !$("case-view").hidden) a.setAttribute("aria-current", "page");
      a.append(node("strong", data.title || data.brief));
      a.append(node("small", sample ? "日英の試作映像" : "日 " + (data.states?.ja || "—") + "　/　英 " + (data.states?.en || "—")));
      nodes.push(a);
    }
  }
  list.replaceChildren(...nodes);
}

function modelLabel(run) {
  const selection = run.model;
  const listed = state.models.find((m) => m.id === selection);
  if (listed) return listed.label;
  // Old runs stored a bare CLI slug; high was the studio's only setting then.
  const [slug, suffix] = String(selection || "").split("@");
  const recorded = run.plan?.model;
  const effort = recorded?.effort || suffix || (slug.startsWith("gpt-") ? "high" : "");
  return [recorded?.requested || slug || "記録なし", effortName[effort] || effort].filter(Boolean).join(" ／ ");
}
function formProfiles(name) {
  return state.models.filter((m) => (m.modelId || m.id) === $(name + "-model").value && m.available);
}
function selectedProfile(name) {
  return formProfiles(name).find((m) => (m.effort || "high") === $(name + "-effort").value);
}
function renderEfforts(name, wanted = $(name + "-effort").value) {
  const select = $(name + "-effort"), choices = formProfiles(name);
  const supported = new Set(choices.map((m) => m.effort || "high"));
  const levels = Object.keys(effortName).filter((level) => supported.has(level));
  for (const level of supported) if (!levels.includes(level)) levels.push(level);
  select.replaceChildren(...levels.map((level) => option(level, effortName[level] || level)));
  const defaultLevel = levels.includes("high") ? "high" : levels[0] || "";
  select.value = levels.includes(wanted) ? wanted : defaultLevel;
  select.disabled = !levels.length;
  const messages = state.models.filter((m) => !m.available).map((m) => m.label + "　" + (m.reason || "利用できません"));
  if (choices[0]?.effort && !levels.includes("ultra")) {
    messages.push((choices[0].family || choices[0].modelId) + " のCLI対応一覧に Ultra はありません。");
  }
  const note = $(name + "-model-note");
  note.textContent = messages.join(" ／ ");
  note.hidden = !note.textContent;
}
function renderModels(error = "") {
  const families = new Map();
  for (const m of state.models) {
    const id = m.modelId || m.id;
    if (!families.has(id) || m.available) families.set(id, m);
  }
  const available = [...families.values()].filter((m) => m.available);
  for (const name of modelForms) {
    const select = $(name + "-model"), previous = select.value;
    select.replaceChildren(...Array.from(families, ([id, m]) => {
      const opt = option(id, (m.family || m.label) + (m.available ? "" : "（利用不可）"));
      opt.disabled = !m.available;
      return opt;
    }));
    select.value = available.some((m) => (m.modelId || m.id) === previous) ? previous : available[0]?.modelId || available[0]?.id || "";
    select.disabled = !available.length;
    renderEfforts(name);
    if (error) {
      const note = $(name + "-model-note");
      note.textContent = error;
      note.hidden = false;
    }
  }
  refreshGenerationButtons();
}
function disableSubmitButtons(form, disabled) {
  for (const button of form.querySelectorAll('button[type="submit"]')) button.disabled = disabled;
}
function refreshGenerationButtons() {
  for (const name of ["new", "rerun"]) {
    const form = $(name + "-form"), language = $(name + "-language").value;
    form.querySelector('[value="video"]').textContent = productionLanguage[language] + "の動画を生成";
    disableSubmitButtons(form, (name === "new" && !state.chosen) || !selectedProfile(name) || form.dataset.busy === "1");
  }
  const adapt = $("adapt-form");
  disableSubmitButtons(adapt, !state.adaptTarget || !selectedProfile("adapt") || adapt.dataset.busy === "1");
}

async function refreshCases() {
  const data = await api("/api/cases");
  state.cases = data.items || [];
  renderNav();
}
function view(id) {
  for (const name of ["loading", "new", "case"]) $(name + "-view").hidden = name !== id;
  renderNav();
}
function closeList() {
  $("case-list").classList.remove("open");
  $("toggle-list").textContent = "一覧を開く"; $("toggle-list").setAttribute("aria-expanded", "false");
}
function closeEdit() {
  clearReadingPreview();
  state.editTarget = null;
  $("edit-form").hidden = true;
}
function closeReview() {
  state.reviewTarget = null;
  $("adopt-form").hidden = true;
}
function closeAdapt() {
  state.adaptTarget = null;
  $("adapt-form").hidden = true;
}
function clearPlayer(video) {
  if (!video.hasAttribute("src")) return;
  video.pause(); video.removeAttribute("src"); video.load();
}
function setPlayer(video, src) {
  const url = safeUrl(src, true);
  if (!url) { clearPlayer(video); return; }
  // A tiny media-fragment seek makes Edge paint the actual first frame before play.
  const firstFrame = new URL(url);
  firstFrame.hash = "t=0.001";
  if (video.getAttribute("src") !== firstFrame.href) { video.pause(); video.src = firstFrame.href; video.load(); }
}
function resetCase() {
  state.detail = null; state.selected = { ja: "", en: "" }; state.lang = "ja";
  state.awaitingEnglishFor = "";
  state.sceneId = ""; state.compare = false; state.compareKey = ""; state.resumeAfter = null;
  for (const id of ["scene-panel", "history-panel", "rerun-panel"]) $(id).open = false;
  closeEdit(); closeReview(); closeAdapt();
  $("rerun-language").value = "ja";
  refreshGenerationButtons();
  clearPlayer($("player")); clearPlayer($("compare-player"));
}
async function route() {
  const version = ++state.routeVersion;
  clearTimeout(state.poll); notify(); closeList();
  resetCase();
  const hash = location.hash;
  if (hash === "#new") {
    $("new-language").value = "ja"; refreshGenerationButtons();
    view("new"); document.title = "新しい案件 | Plunode 映像制作室";
    if (!state.results.length) searchThemes();
    return;
  }
  view("loading");
  try {
    let id = hash.startsWith("#case/") ? decodeURIComponent(hash.slice(6)) : "";
    if (!id) {
      await refreshCases();
      if (version !== state.routeVersion) return;
      id = state.cases.find((c) => !c.reference)?.id || state.cases[0]?.id;
      if (!id) { location.replace("#new"); return; }
      history.replaceState(null, "", caseHash(id));
    }
    const data = await api("/api/cases/" + encodeURIComponent(id));
    if (version !== state.routeVersion) return;
    state.detail = data;
    const latest = orderedRuns()[0];
    if (latest?.plan?.japaneseMasterRunId && hasEdition(latest, "en")) {
      state.selected.ja = latest.plan.japaneseMasterRunId;
      state.selected.en = latest.id;
      state.lang = "en";
    }
    view("case"); drawCase(); schedule();
    if (chosenRun()?.status === "script_ready") $("scene-panel").open = true;
  } catch (err) {
    if (version !== state.routeVersion) return;
    $("loading-view").hidden = true; notify(err.message, true, route);
  }
}

function currentRuns() { return state.detail?.runs || []; }
function orderedRuns() {
  return [...currentRuns()].sort((a, b) => millis(b.created) - millis(a.created));
}
function playable(lang) { return orderedRuns().filter((r) => r.editions?.[lang]?.video); }
function hasEdition(run, lang) {
  return Boolean(run.editions?.[lang]?.video || (run.langs?.includes(lang) && run.plan?.scenes?.length));
}
function japaneseMaster(run) { return Boolean(run?.plan?.titles?.ja && !run.plan.titles.en); }
function sameSceneSequence(left, leftLang, right, rightLang) {
  if (leftLang === rightLang) return true;
  const [ja, en] = leftLang === "ja" ? [left, right] : [right, left];
  if (japaneseMaster(ja) || en?.plan?.japaneseMasterRunId) return Boolean(ja && en?.plan?.japaneseMasterRunId === ja.id);
  return true;
}
function runLanguage(run) {
  return productionLanguage[run.langs.length === 1 ? run.langs[0] : "both"];
}
function runNumber(runId) {
  return orderedRuns().reverse().findIndex((r) => r.id === runId) + 1;
}
function chosenRun(lang = state.lang) {
  return currentRuns().find((r) => r.id === state.selected[lang] && hasEdition(r, lang));
}
function ensureSelection(lang) {
  if (chosenRun(lang)) return;
  const available = orderedRuns().filter((r) => hasEdition(r, lang));
  if (lang === "en" && state.awaitingEnglishFor) {
    const match = available.find((r) => r.plan?.japaneseMasterRunId === state.awaitingEnglishFor);
    if (match) { state.selected.en = match.id; state.awaitingEnglishFor = ""; }
    return;
  }
  state.selected[lang] = available.find((r) => r.id === state.detail.accepted?.[lang])?.id || available[0]?.id || "";
}
function editionLabel(run, lang) {
  if (state.detail.reference) return "品質の見本";
  const order = runNumber(run.id);
  if (!run.editions?.[lang]?.video) return "試行 " + order + " · " + (jobName[run.status] || "台本");
  const adopted = state.detail.accepted?.[lang] === run.id || run.editions?.[lang]?.accepted;
  const needsWork = run.editions?.[lang]?.reviewStatus === "rework";
  return "試行 " + order + (needsWork ? " · 要修正" : adopted ? " · 採用版" : " · 試写版");
}
function drawCase() {
  const data = state.detail;
  $("case-channel").textContent = (data.reference ? "品質の見本" : "制作案件") + "　/　公開第" + data.revision + "版";
  $("case-title").textContent = data.title || data.brief;
  $("case-brief").textContent = data.brief === data.title ? "" : data.brief || "";
  document.title = (data.title || "制作案件") + " | Plunode 映像制作室";
  const url = safeUrl(data.themeUrl);
  $("theme-link").hidden = !url;
  if (url) {
    $("theme-link").href = url;
    $("theme-link").title = data.themeTitle || data.title;
  }
  $("rerun-panel").hidden = Boolean(data.reference);
  $("reference-link").hidden = Boolean(data.reference);
  for (const lang of Object.keys(languageName)) ensureSelection(lang);
  drawProgress(); drawWatch(); drawHistory();
}

function drawWatch() {
  const lang = state.lang;
  const runs = orderedRuns().filter((r) => hasEdition(r, lang));
  const run = chosenRun();
  const ed = run?.editions[lang];
  for (const key of Object.keys(languageName)) {
    const tab = $("lang-" + key);
    tab.disabled = !currentRuns().some((r) => r.langs.includes(key));
    tab.setAttribute("aria-pressed", String(key === lang));
  }
  const select = $("edition-select");
  const gap = lang === "en" && state.awaitingEnglishFor && !run;
  const versions = runs.map((r) => option(r.id, editionLabel(r, lang)));
  if (gap || !runs.length) versions.unshift(option("", gap ? "この日本語版に対応する英語版" : "制作中の版"));
  select.replaceChildren(...versions);
  select.disabled = !runs.length; select.value = run?.id || "";
  setPlayer($("player"), ed?.video);
  $("player").closest(".screen").classList.toggle("script-preview", Boolean(gap) || run?.status === "script_ready");
  $("empty-video").hidden = Boolean(ed?.video);
  $("empty-video").textContent = run?.status === "script_ready" ? "台本の確認後、" + runLanguage(run) + "の映像を生成できます。" : "映像の完成後、ここで試写できます。";
  const subtitle = safeUrl(ed?.subtitles, true);
  $("subtitle-link").hidden = !subtitle;
  if (subtitle) $("subtitle-link").href = subtitle;
  $("preview-status").textContent = languageName[lang] + "　/　" + (run?.plan?.titles?.[lang] || state.detail.states?.[lang] || "待機中");
  const selectedJapanese = chosenRun("ja");
  if (lang === "en" && run && selectedJapanese && !sameSceneSequence(selectedJapanese, "ja", run, "en")) {
    $("preview-status").textContent += "　·　日本語の試行 " + runNumber(selectedJapanese.id) + " とは別の制作版";
  }
  if (gap) {
    const source = "日本語の試行 " + runNumber(state.awaitingEnglishFor);
    $("empty-video").textContent = source + " から作った英語版はまだ試写できません。";
    $("preview-status").textContent = "English　/　" + source;
  }
  const approved = state.detail.accepted?.[lang] === run?.id || ed?.accepted;
  $("approval-row").hidden = !ed?.video || state.detail.reference;
  $("adapt-open").hidden = $("approval-row").hidden || lang !== "ja";
  if ($("adapt-open").hidden || state.adaptTarget?.parent !== run?.id) closeAdapt();
  $("adopt-toggle").hidden = Boolean(approved);
  $("rework-toggle").hidden = ed?.reviewStatus === "rework";
  if ($("approval-row").hidden) closeReview();
  drawScenes(run); drawEvidence(run); drawComparison();
}
function timings(run, lang) { return run?.editions?.[lang]?.timings || []; }
function seek(video, seconds) {
  if (!video.hasAttribute("src") || !Number.isFinite(Number(seconds))) return;
  const expected = video.src;
  const move = () => {
    if (video.src === expected) video.currentTime = Math.max(0, Number(seconds));
  };
  if (video.readyState >= 1) move();
  else video.addEventListener("loadedmetadata", move, { once: true });
}
function currentSceneFromPlayer() {
  const time = $("player").currentTime;
  const times = timings(chosenRun(), state.lang);
  return times.filter((t) => Number(t.start) <= time + 0.001).at(-1)?.id || times[0]?.id || state.sceneId;
}
function seekScene(id) {
  const time = timings(chosenRun(), state.lang).find((t) => t.id === id);
  if (time) seek($("player"), time.start);
}

function drawScenes(run) {
  const scenes = run?.plan?.scenes || [];
  const intent = $("story-intent"), story = run?.plan?.story;
  intent.replaceChildren();
  for (const [key, label] of [["question", "初めて見る人の問い"], ["explanation", "この動画で伝えること"], ["visualCheck", "画面で確かめること"]]) {
    if (story?.[key]) intent.append(node("dt", label), node("dd", story[key]));
  }
  intent.hidden = !intent.childElementCount;
  $("scene-count").textContent = String(scenes.length);
  const select = $("scene-select");
  const ts = new Map(timings(run, state.lang).map((t) => [t.id, t.start]));
  select.replaceChildren(...scenes.map((s, i) => option(s.id, (ts.has(s.id) ? clock(ts.get(s.id)) + "　" : "") + (s[state.lang]?.heading || "場面 " + (i + 1)))));
  if (!scenes.some((s) => s.id === state.sceneId)) state.sceneId = scenes[0]?.id || "";
  select.value = state.sceneId; select.disabled = !scenes.length;
  drawSceneText();
}
function drawSceneText() {
  const run = chosenRun();
  const scene = run?.plan?.scenes?.find((s) => s.id === state.sceneId);
  $("scene-narration").textContent = scene?.[state.lang]?.narration || "台本のある版を選ぶと、この場面の語りを確認できます。";
  const observations = scene?.[state.lang]?.reviewNotes || [];
  $("scene-notes").replaceChildren(...observations.map((o) => {
    const p = node("p", null, "review-note");
    p.append(node("strong", o.basis), document.createTextNode("　" + o.note));
    return p;
  }));
  const sources = (run?.plan?.sources || []).filter((s) => scene?.sourceIds?.includes(s.id));
  $("scene-sources").replaceChildren(...sources.map((s) => externalLink(s.url, s.title || s.url)));
  const hasVideo = Boolean(run?.editions?.[state.lang]?.video);
  $("edit-toggle").hidden = state.detail.reference || !scene || (!hasVideo && run.status !== "script_ready");
  $("edit-toggle").textContent = state.lang === "ja" ? "語りと日本語の読みを確認・編集" : "この場面の語りを編集";
  $("scene-from-playback").hidden = !scene || !hasVideo;
  if ($("edit-toggle").hidden) closeEdit();
}
function drawEvidence(run) {
  const plan = run?.plan || (!state.awaitingEnglishFor && orderedRuns().find((r) => r.plan)?.plan);
  const sources = plan?.sources || [];
  const links = node("div", null, "source-list");
  links.append(...sources.map((s) => externalLink(s.url, s.title || s.url)));
  const body = $("evidence");
  const themeLabel = state.detail.themeTitle ? state.detail.themeTitle + "　/　" : "";
  const nodes = [node("p", themeLabel + "テーマ公開第" + state.detail.revision + "版" + (state.detail.reference ? " · 試作の比較用保存版" : ""), "subtle")];
  if (run && !state.detail.reference) {
    if (plan?.japaneseMasterRunId) nodes.push(node("p", "英語版の元にした日本語版　試行 " + runNumber(plan.japaneseMasterRunId), "subtle"));
    nodes.push(node("p", "指定モデル・推論の強さ　" + modelLabel(run), "subtle"));
    if (run.plan?.model) nodes.push(node("p", "実行モデル　" + (run.plan.model.actual || "不明"), "subtle"));
    const ed = run.editions?.[state.lang];
    if (ed?.reviewReason) nodes.push(node("p", (ed.reviewStatus === "rework" ? "要修正　" : "採用理由　") + ed.reviewReason, "review-note"));
  }
  if (state.detail.reference) nodes.push(node("p", "脚本モデル・推論設定は未記録。英語話者による発音と抑揚の試聴は未実施です。", "subtle"));
  nodes.push(sources.length ? links : node("p", "生成した台本の出典はここに表示されます。", "subtle"));
  body.replaceChildren(...nodes);
}

function compareCandidates() {
  const list = [];
  const current = chosenRun();
  for (const lang of [state.lang === "ja" ? "en" : "ja", state.lang]) {
    const candidates = playable(lang);
    if (lang !== state.lang) candidates.sort((a, b) => Number(sameSceneSequence(current, state.lang, b, lang))
      - Number(sameSceneSequence(current, state.lang, a, lang)));
    for (const run of candidates) {
      if (lang === state.lang && run.id === state.selected[lang]) continue;
      list.push({ key: JSON.stringify([run.id, lang]), lang, run });
    }
  }
  return list;
}
function drawComparison() {
  const choices = compareCandidates();
  const toggle = $("compare-toggle");
  toggle.disabled = !chosenRun()?.editions?.[state.lang]?.video || !choices.length;
  if (toggle.disabled) state.compare = false;
  toggle.setAttribute("aria-expanded", String(state.compare));
  toggle.textContent = state.compare ? "比較を閉じる" : "別の版と比較";
  $("watch-grid").classList.toggle("compare", state.compare);
  $("comparison").hidden = !state.compare;
  if (!state.compare) { clearPlayer($("compare-player")); return; }
  const selected = choices.find((c) => c.key === state.compareKey) || choices[0];
  state.compareKey = selected.key;
  const select = $("compare-select");
  select.replaceChildren(...choices.map((c) => option(c.key, languageName[c.lang] + "　" + editionLabel(c.run, c.lang))));
  select.value = selected.key;
  setPlayer($("compare-player"), selected.run.editions[selected.lang].video);
  const related = sameSceneSequence(chosenRun(), state.lang, selected.run, selected.lang);
  $("align-compare").disabled = !related;
  $("compare-label").textContent = (selected.run.plan?.titles?.[selected.lang] || languageName[selected.lang]) + (related ? "" : "　·　別の制作版");
}
function alignCompare() {
  if ($("align-compare").disabled) return;
  const key = currentSceneFromPlayer();
  const target = compareCandidates().find((c) => c.key === state.compareKey);
  const at = target && timings(target.run, target.lang).find((t) => t.id === key);
  if (at) seek($("compare-player"), at.start);
  else notify("比較する版に、この場面はありません。");
}
function switchPreview(lang, id) {
  const priorRun = chosenRun(), priorLang = state.lang;
  const anchor = currentSceneFromPlayer();
  state.lang = lang;
  state.awaitingEnglishFor = "";
  if (id) state.selected[lang] = id;
  else if (lang === "ja" && priorRun?.plan?.japaneseMasterRunId) state.selected.ja = priorRun.plan.japaneseMasterRunId;
  else if (lang === "en" && priorRun) {
    const previous = chosenRun("en");
    const derived = previous?.plan?.japaneseMasterRunId === priorRun.id ? previous
      : orderedRuns().find((r) => r.plan?.japaneseMasterRunId === priorRun.id && hasEdition(r, "en"));
    if (derived) state.selected.en = derived.id;
    else if (japaneseMaster(priorRun)) {
      state.selected.en = ""; state.awaitingEnglishFor = priorRun.id; state.resumeAfter = null;
    }
    else if (priorRun.status === "script_ready" && hasEdition(priorRun, "en")) state.selected.en = priorRun.id;
  }
  else if (priorRun?.status === "script_ready" && hasEdition(priorRun, lang)) state.selected[lang] = priorRun.id;
  ensureSelection(lang);
  const preserveTime = $("player").currentTime > 0.05 && sameSceneSequence(priorRun, priorLang, chosenRun(), lang);
  state.sceneId = preserveTime ? anchor : priorRun?.id === chosenRun()?.id ? state.sceneId : "";
  closeEdit(); closeReview(); closeAdapt();
  drawWatch(); drawProgress();
  if (chosenRun()?.status === "script_ready") $("scene-panel").open = true;
  if (preserveTime && state.sceneId === anchor) seekScene(anchor);
}

function inspectScript(run) {
  const button = node("button", "この台本を確認", "quiet small");
  button.type = "button";
  button.onclick = () => {
    switchPreview(run.langs.includes(state.lang) ? state.lang : run.langs[0], run.id);
    $("scene-select").focus();
  };
  return button;
}
function statusButton(run) {
  if (state.detail.reference || !["running", "queued", "failed", "interrupted", "script_ready"].includes(run.status)) return null;
  const startVideo = run.status === "script_ready";
  const resume = !pending(run);
  const button = node("button", startVideo ? "この台本で" + runLanguage(run) + "の映像を生成" : resume ? "再開" : "中断", "secondary small");
  button.type = "button";
  button.onclick = async () => {
    const edit = state.editTarget;
    if (startVideo && edit?.parent === run.id) {
      const line = run.plan.scenes.find((scene) => scene.id === edit.sceneId)[edit.lang];
      const readingChanged = edit.lang === "ja" && JSON.stringify(currentReadings()) !==
        JSON.stringify((line.readings || []).map(({ text, kana }) => ({ text, kana })));
      if (trim($("edit-narration").value) !== line.narration || readingChanged || trim($("edit-reason").value)) {
        notify("編集中の変更があります。修正した台本を保存すると、その版から映像を生成できます。");
        $("edit-submit").focus();
        return;
      }
    }
    const active = state.detail.id;
    button.disabled = true;
    try {
      await api(detailPath(resume ? "/resume" : "/pause"), { runId: run.id });
      if (state.detail?.id !== active) return;
      if (resume) state.resumeAfter = run.id;
      await reloadDetail();
      notify(startVideo ? "この台本から" + runLanguage(run) + "の映像生成を開始しました。" : resume ? "再開を受け付けました。" : "中断を受け付けました。処理の区切りで停止します。");
    } catch (err) { if (state.detail?.id === active) notify(err.message, true); }
    finally { button.disabled = false; }
  };
  return button;
}
function drawProgress() {
  const ordered = orderedRuns(), latest = ordered[0];
  const selected = chosenRun();
  const relevant = ordered.filter((r) => pending(r)
    || (r === latest && ["interrupted", "failed"].includes(r.status))
    || ((r === selected || r === latest) && r.status === "script_ready"));
  const boxes = relevant.map((run) => {
    const bad = run.status === "failed";
    const box = node("div", null, "status-box" + (bad ? " bad" : ""));
    box.append(node("strong", "試行 " + (ordered.length - ordered.indexOf(run)) + " · " + (jobName[run.status] || run.status) + "　"), node("span", run.error || run.progress || ""));
    const button = run.status === "script_ready" && run !== selected ? inspectScript(run) : statusButton(run);
    if (button) box.append(button);
    return box;
  });
  $("run-progress").replaceChildren(...boxes);
}
function drawHistory() {
  const ordered = orderedRuns();
  $("history-count").textContent = String(ordered.length);
  const rows = ordered.map((run, i) => {
    const row = node("div", null, "run-row");
    const heading = state.detail.reference ? "比較用の保存版" : "試行 " + (ordered.length - i);
    row.append(node("strong", heading + "　" + (jobName[run.status] || run.status)));
    const langs = (run.langs || []).map((l) => languageName[l] || l).join(" / ");
    row.append(node("p", [when(run.created), langs, state.detail.reference ? null : modelLabel(run)].filter(Boolean).join("　·　"), "subtle"));
    if (run.plan?.japaneseMasterRunId) row.append(node("p", "元の日本語版　試行 " + runNumber(run.plan.japaneseMasterRunId), "subtle"));
    if (run.reason) row.append(node("p", run.reason));
    if (run.error || ((pending(run) || run.status === "script_ready") && run.progress)) row.append(node("p", run.error || run.progress));
    if (run.status === "script_ready") row.append(inspectScript(run));
    const button = statusButton(run);
    if (button) row.append(button);
    return row;
  });
  $("history").replaceChildren(...rows);
}
function schedule() {
  clearTimeout(state.poll);
  if (!currentRuns().some(pending)) return;
  const id = state.detail.id;
  state.poll = setTimeout(async () => {
    if (state.detail?.id !== id) return;
    try { await reloadDetail(); }
    catch (err) {
      if (state.detail?.id === id) { notify(err.message, true, () => reloadDetail().catch((e) => notify(e.message, true))); schedule(); }
    }
  }, 2500);
}
async function reloadDetail() {
  if (!state.detail) return;
  const id = state.detail.id;
  const version = state.routeVersion;
  const previous = state.detail;
  const data = await api(detailPath());
  if (state.routeVersion !== version || state.detail?.id !== id) return;
  state.detail = data;
  const target = currentRuns().find((r) => r.id === state.resumeAfter);
  let switched = false;
  if (target && ["done", "script_ready"].includes(target.status)) {
    for (const lang of target.langs || []) {
      if (!hasEdition(target, lang) || lang === state.editTarget?.lang || lang === state.reviewTarget?.lang || (lang === "ja" && state.adaptTarget)) continue;
      state.selected[lang] = target.id;
    }
    if (target.langs.length === 1 && !state.editTarget && !state.reviewTarget && !state.adaptTarget) {
      state.lang = target.langs[0];
      if (target.plan?.japaneseMasterRunId) state.selected.ja = target.plan.japaneseMasterRunId;
      state.sceneId = ""; switched = true;
    }
    state.resumeAfter = null;
  }
  const outputs = (item) => JSON.stringify([item.accepted, (item.runs || []).map((r) => [r.id, r.status, Boolean(r.plan), r.editions])]);
  if (switched || previous.title !== data.title || outputs(previous) !== outputs(data)) {
    drawCase();
    const selected = chosenRun();
    if (selected?.status === "script_ready" && !previous.runs.some((r) => r.id === selected.id && r.status === "script_ready")) $("scene-panel").open = true;
  }
  else { drawProgress(); drawHistory(); }
  const summary = state.cases.find((c) => c.id === id);
  if (summary) { summary.states = data.states; summary.title = data.title; renderNav(); }
  schedule();
}

async function searchThemes() {
  const version = ++state.searchVersion;
  const q = $("theme-query").value.trim();
  $("search-status").textContent = "公開テーマを検索中…";
  $("theme-results").replaceChildren();
  try {
    const result = await api("/api/themes?q=" + encodeURIComponent(q));
    if (version !== state.searchVersion) return;
    state.results = result.items || [];
    $("search-status").textContent = state.results.length ? state.results.length + "件の候補から選択" : "一致する公開テーマがありません。別の言葉で検索できます。";
    drawThemeResults();
  } catch (err) {
    if (version === state.searchVersion) { state.results = []; $("search-status").textContent = err.message; }
  }
}
function drawThemeResults() {
  const buttons = state.results.map((item) => {
    const button = node("button", null, "theme-result");
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.chosen?.id === item.id));
    button.append(node("span", item.title), node("small", "第" + item.revision + "版"));
    button.onclick = () => {
      state.chosen = item;
      $("theme-selection").hidden = false;
      $("chosen-theme").textContent = item.title;
      $("theme-revision").value = item.revision; $("theme-revision").max = item.revision;
      drawThemeResults(); refreshGenerationButtons();
    };
    return button;
  });
  $("theme-results").replaceChildren(...buttons);
}

// Preserve a request key across an ambiguous network failure or a page reload.
// An intentional new submission gets a new key after the server acknowledges it.
async function submitRun(scope, path, payload) {
  const key = "plunode.studio.request." + scope;
  const text = new TextEncoder().encode(JSON.stringify(payload));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", text)), (n) => n.toString(16).padStart(2, "0")).join("");
  let prior;
  try { prior = JSON.parse(sessionStorage.getItem(key)); } catch { prior = null; }
  const requestId = prior?.hash === hash ? prior.requestId : crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ hash, requestId }));
  const result = await api(path, { ...payload, requestId });
  sessionStorage.removeItem(key);
  return result;
}
function formAction(formId, handler) {
  const form = $(formId);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.busy === "1") return;
    const action = event.submitter?.value;
    const version = state.routeVersion;
    form.dataset.busy = "1"; disableSubmitButtons(form, true); notify();
    try { await handler(version, action); }
    catch (err) { if (state.routeVersion === version) notify(err.message, true); }
    finally {
      delete form.dataset.busy;
      if (["new-form", "rerun-form", "adapt-form"].includes(formId)) refreshGenerationButtons();
      else disableSubmitButtons(form, false);
    }
  });
}

$("toggle-list").onclick = () => {
  const expanded = $("case-list").classList.toggle("open");
  $("toggle-list").setAttribute("aria-expanded", String(expanded));
  $("toggle-list").textContent = expanded ? "一覧を閉じる" : "一覧を開く";
};
$("search-themes").onclick = searchThemes;
$("theme-query").onkeydown = (e) => {
  if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); searchThemes(); }
};
for (const name of modelForms) {
  $(name + "-model").onchange = () => { renderEfforts(name); refreshGenerationButtons(); };
  $(name + "-effort").onchange = refreshGenerationButtons;
}
for (const id of ["new-language", "rerun-language"]) $(id).onchange = refreshGenerationButtons;
formAction("new-form", async (version, action) => {
  const profile = selectedProfile("new");
  if (!state.chosen || !profile) return;
  const result = await submitRun("new", "/api/cases", {
    themeId: state.chosen.id, revision: Number($("theme-revision").value), brief: trim($("brief").value), model: profile.id,
    language: $("new-language").value, scriptFirst: action !== "video",
  });
  await refreshCases();
  if (state.routeVersion !== version) return;
  $("brief").value = "";
  location.hash = caseHash(result.id);
});
$("lang-ja").onclick = () => { if (state.lang !== "ja") switchPreview("ja"); };
$("lang-en").onclick = () => { if (state.lang !== "en") switchPreview("en"); };
$("edition-select").onchange = () => switchPreview(state.lang, $("edition-select").value);
$("compare-toggle").onclick = () => { state.compare = !state.compare; drawComparison(); if (state.compare) alignCompare(); };
$("compare-select").onchange = () => { state.compareKey = $("compare-select").value; drawComparison(); alignCompare(); };
$("align-compare").onclick = alignCompare;
$("scene-select").onchange = () => {
  state.sceneId = $("scene-select").value; closeEdit();
  $("player").pause();
  drawSceneText(); seekScene(state.sceneId);
  if (state.compare && !$("align-compare").disabled) {
    const target = compareCandidates().find((c) => c.key === state.compareKey);
    const t = target && timings(target.run, target.lang).find((item) => item.id === state.sceneId);
    if (t) seek($("compare-player"), t.start);
  }
};
$("scene-from-playback").onclick = () => {
  const id = currentSceneFromPlayer();
  if (!id || state.sceneId === id) return;
  closeEdit();
  state.sceneId = id; $("scene-select").value = id; drawSceneText();
};
// Keep one soundtrack audible when a reviewer swaps between previews.
const players = [$("player"), $("compare-player"), $("reading-player")];
for (const player of players) {
  player.addEventListener("play", () => { for (const other of players) if (other !== player) other.pause(); });
}
function openReview(action) {
  const run = chosenRun();
  if (!run?.editions?.[state.lang]?.video) return;
  const isRework = action === "rework";
  state.reviewTarget = Object.freeze({ caseId: state.detail.id, runId: run.id, lang: state.lang, action });
  $("review-target").textContent = languageName[state.lang] + "　/　" + editionLabel(run, state.lang);
  $("review-reason-label").textContent = isRework ? "修正が必要な理由" : "採用理由";
  $("review-submit").textContent = isRework ? "要修正として記録" : "採用を記録";
  $("adopt-form").hidden = false; $("adopt-reason").value = ""; $("adopt-reason").focus();
}
$("adopt-toggle").onclick = () => openReview("adopt");
$("rework-toggle").onclick = () => openReview("rework");
$("adopt-cancel").onclick = closeReview;
formAction("adopt-form", async (version) => {
  const target = state.reviewTarget;
  if (!target || target.caseId !== state.detail?.id) return;
  await api(detailPath("/" + target.action), { lang: target.lang, runId: target.runId, reason: trim($("adopt-reason").value) });
  if (version !== state.routeVersion) return;
  if (state.reviewTarget === target) closeReview();
  await reloadDetail(); notify(target.action === "rework" ? "この版を要修正として記録しました。" : "この言語の採用版を記録しました。");
});
function clearReadingPreview() {
  state.readingRequest?.abort();
  state.readingRequest = null;
  const player = $("reading-player");
  clearPlayer(player);
  if (state.readingUrl) URL.revokeObjectURL(state.readingUrl);
  state.readingUrl = null;
  player.hidden = true;
  $("listen-reading").disabled = false;
  $("reading-status").textContent = "";
}
function addReading(term = "", kana = "") {
  const row = node("div", null, "reading-row");
  for (const [name, text] of [["字幕の表記", term], ["読み（かな）", kana]]) {
    const label = node("label", name), field = node("input");
    field.type = "text"; field.value = text; field.required = true;
    field.addEventListener("input", clearReadingPreview);
    label.append(field); row.append(label);
  }
  const remove = node("button", "削除", "quiet small");
  remove.type = "button";
  remove.onclick = () => { clearReadingPreview(); row.remove(); $("add-reading").focus(); };
  row.append(remove); $("reading-rows").append(row);
  return row;
}
function currentReadings() {
  return Array.from($("reading-rows").children, (row) => {
    const [term, kana] = row.querySelectorAll("input");
    return { text: trim(term.value), kana: trim(kana.value) };
  });
}
$("add-reading").onclick = () => {
  clearReadingPreview();
  addReading().querySelector("input").focus();
};
$("edit-narration").addEventListener("input", clearReadingPreview);
$("listen-reading").onclick = async () => {
  const target = state.editTarget;
  if (target?.lang !== "ja") return;
  clearReadingPreview();
  const request = new AbortController();
  state.readingRequest = request;
  const current = () => state.readingRequest === request && state.editTarget === target;
  const status = $("reading-status"), player = $("reading-player");
  $("listen-reading").disabled = true; status.textContent = "音声を生成中…";
  try {
    const response = await fetch("/api/reading-preview", {
      method: "POST", credentials: "same-origin", cache: "no-store", signal: request.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narration: trim($("edit-narration").value), readings: currentReadings() }),
    });
    if (!response.ok) {
      const value = await response.json().catch(() => ({}));
      throw new Error(value.error || "試聴用の音声を生成できませんでした。");
    }
    const audio = await response.blob();
    if (!current()) return;
    state.readingUrl = URL.createObjectURL(audio);
    player.src = state.readingUrl; player.hidden = false;
    status.textContent = "試聴用の音声";
    try { await player.play(); }
    catch { if (current()) status.textContent = "再生ボタンで試聴できます。"; }
  } catch (err) {
    if (current()) status.textContent = err.message;
  } finally {
    if (current()) {
      state.readingRequest = null; $("listen-reading").disabled = false;
    }
  }
};
$("edit-toggle").onclick = () => {
  const run = chosenRun(), lang = state.lang;
  const scene = run?.plan?.scenes?.find((s) => s.id === $("scene-select").value);
  if (!scene) return;
  state.sceneId = scene.id;
  $("player").pause(); seekScene(scene.id);
  const model = typeof run.model === "string" ? run.model : run.model?.requested;
  clearReadingPreview();
  const draft = run.status === "script_ready";
  state.editTarget = Object.freeze({ caseId: state.detail.id, parent: run.id, lang, model, sceneId: scene.id, draft });
  $("edit-target").textContent = [languageName[lang], editionLabel(run, lang), $("scene-select").selectedOptions[0].textContent].join("　/　");
  $("edit-narration").value = scene[lang]?.narration || "";
  const pronunciation = $("pronunciation");
  pronunciation.hidden = pronunciation.disabled = lang !== "ja";
  $("reading-rows").replaceChildren();
  if (lang === "ja") for (const row of scene.ja.readings || []) addReading(row.text, row.kana);
  $("edit-reason").value = ""; $("edit-form").hidden = false;
  $("edit-submit").textContent = draft ? "修正した台本を新しい試行に保存" : languageName[lang] + "版だけ再生成";
  $("edit-narration").focus();
};
$("edit-cancel").onclick = closeEdit;
formAction("edit-form", async (version) => {
  const target = state.editTarget;
  if (!target || target.caseId !== state.detail?.id) return;
  const { parent, model, lang, sceneId } = target;
  const payload = { parent, model, lang, sceneId, narration: trim($("edit-narration").value), reason: trim($("edit-reason").value) };
  if (lang === "ja") payload.readings = currentReadings();
  const result = await submitRun("edit." + target.caseId, detailPath("/runs"), payload);
  if (state.routeVersion !== version) return;
  state.resumeAfter = result.runId;
  if (state.editTarget === target) closeEdit();
  await reloadDetail(); notify(target.draft ? "修正した台本を新しい試行に保存しました。" : "修正した言語の再生成を受け付けました。");
});
formAction("rerun-form", async (version, action) => {
  const profile = selectedProfile("rerun");
  if (!profile) return;
  const payload = { model: profile.id, parent: chosenRun()?.id || orderedRuns()[0]?.id,
    reason: trim($("rerun-reason").value), language: $("rerun-language").value, scriptFirst: action !== "video" };
  const result = await submitRun("rerun." + state.detail.id, detailPath("/runs"), payload);
  if (state.routeVersion !== version) return;
  state.resumeAfter = result.runId; $("rerun-reason").value = ""; $("rerun-panel").open = false;
  await reloadDetail(); notify(productionLanguage[payload.language] + (payload.scriptFirst ? "の台本" : "の動画") + "の生成を受け付けました。");
});
$("adapt-open").onclick = () => {
  const run = chosenRun();
  if (state.lang !== "ja" || !run?.editions?.ja?.video || state.detail.reference) return;
  state.adaptTarget = Object.freeze({ caseId: state.detail.id, parent: run.id });
  $("adapt-target").textContent = "元の日本語版　" + editionLabel(run, "ja") + "　" + run.plan.titles.ja;
  const profile = state.models.find((m) => m.id === run.model && m.available);
  if (profile) {
    $("adapt-model").value = profile.modelId || profile.id;
    renderEfforts("adapt", profile.effort || "high");
  }
  $("adapt-form").hidden = false; refreshGenerationButtons(); $("adapt-model").focus();
};
$("adapt-cancel").onclick = closeAdapt;
formAction("adapt-form", async (version, action) => {
  const target = state.adaptTarget;
  const profile = selectedProfile("adapt");
  if (!target || target.caseId !== state.detail?.id || !profile) return;
  const payload = { parent: target.parent, language: "en", model: profile.id, scriptFirst: action !== "video" };
  const result = await submitRun("adapt." + target.caseId, detailPath("/runs"), payload);
  if (state.routeVersion !== version) return;
  if (state.adaptTarget === target) {
    state.resumeAfter = result.runId;
    closeAdapt();
  }
  await reloadDetail(); notify("選んだ日本語版から英語の" + (payload.scriptFirst ? "台本" : "動画") + "の制作を開始しました。");
});
async function loadModels() {
  try {
    const data = await api("/api/models"); state.models = data.items || []; renderModels();
  } catch (err) {
    state.models = []; renderModels(err.message);
    notify("モデル設定を取得できませんでした。 " + err.message, true, loadModels);
  }
}
window.addEventListener("hashchange", route);
if (location.hash && location.hash !== "#home") {
  refreshCases().catch((e) => notify(e.message, true, () => refreshCases().catch((err) => notify(err.message, true))));
}
loadModels();
refreshGenerationButtons();
route();
