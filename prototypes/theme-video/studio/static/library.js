"use strict";

const productionLibrary = { cases: [], youtube: [], placements: [], trash: false, scroll: {library: 0, trash: 0} };
let libraryPreview = null;

const youtubeLabels = {
  queued: "送信待ち", uploading: "送信中", processing: "処理中", unknown: "結果確認待ち", uncertain: "結果確認待ち",
  attention: "要対応", failed: "要対応", rejected: "要対応", missing: "YouTubeで削除", private: "非公開", unlisted: "限定公開", public: "公開",
};

function libraryViewName() {
  return productionLibrary.trash ? "trash" : "library";
}
function libraryVideoState(job) {
  return job.status === "ready" ? (job.privacy || "ready") : job.status;
}
function libraryStatuses(caseId, collection, type) {
  const content = document.createDocumentFragment();
  for (const lang of ["ja", "en"]) {
    const matches = collection.filter((entry) => entry.caseId === caseId && entry.lang === lang);
    const values = type === "YouTube"
      ? [...new Set(matches.map((job) => youtubeLabels[libraryVideoState(job)] || "確認待ち"))]
      : [...new Set(matches.map((item) => item.environment === "production" ? "正式" : "β"))];
    content.append(node("span", (lang === "ja" ? "日 " : "英 ") + (values.join("・") || "—"), "library-status"));
  }
  return content;
}
function generationTimeLabel(timing) {
  if (!timing || !Number.isFinite(timing.seconds) || timing.seconds <= 0) return "";
  const minutes = Math.max(1, Math.round(timing.seconds / 60));
  const duration = timing.seconds < 60
    ? Math.max(1, Math.round(timing.seconds / 5) * 5) + "秒"
    : minutes >= 60
      ? Math.floor(minutes / 60) + "時間" + (minutes % 60 ? minutes % 60 + "分" : "")
      : minutes + "分";
  return (timing.estimated ? "受付から完成まで" : "生成に") + " 約" + duration;
}

const compactTokens = new Intl.NumberFormat("ja", { notation: "compact", maximumSignificantDigits: 2 });
const recordedTokens = new Intl.NumberFormat("ja");

function tokenUsageDisplay(usage, { scope = "選択中の版", compact = false } = {}) {
  if (!usage) return null;
  const quantities = [
    ["input", "入力"], ["output", "出力"], ["total", "合計"],
    ["cachedInput", "うちキャッシュ読取"], ["cacheWriteInput", "うちキャッシュ書込"],
    ["reasoningOutput", "うち推論出力"],
  ].filter(([key]) => Number.isSafeInteger(usage[key]) && usage[key] >= 0);
  if (!quantities.length) return null;

  const measuredScope = usage.shared ? "日英共通" : scope;
  const label = "トークン" + (usage.partial ? "（一部記録）" : "");
  const format = (formatter, fields) => fields.map(([key, name]) => name + " " + formatter.format(usage[key])).join(" · ");
  const direction = quantities.filter(([key]) => key === "input" || key === "output");
  const visible = compact && direction.length ? direction : quantities;
  const displayScope = usage.shared || !compact ? "（" + measuredScope + "）" : "";
  const display = node("span", label + displayScope + " 約 " + format(compactTokens, visible));
  display.title = label + "（" + measuredScope + "） " + format(recordedTokens, quantities);
  return display;
}

function libraryModels(entries) {
  const content = document.createDocumentFragment();
  const versions = ["ja", "en"]
    .filter((language) => entries?.[language]?.model)
    .map((language) => {
      const version = entries[language];
      return {
        language, runId: version.runId, shared: version.tokenUsage?.shared,
        label: modelLabel(version), time: generationTimeLabel(version.timing),
        tokens: tokenUsageDisplay(version.tokenUsage, { compact: true }),
      };
    });
  if (!versions.length) {
    content.append(node("span", "—"));
    return content;
  }
  const [ja, en] = versions;
  const sharedTokens = en && ja.runId && ja.runId === en.runId && ja.shared && en.shared
    && ja.tokens && ja.tokens.title === en.tokens?.title;
  const same = en && ja.label === en.label && ja.time === en.time
    && (sharedTokens || (!ja.tokens && !en.tokens));
  for (const version of same ? [ja] : versions) {
    const name = node("span", (en && !same ? (version.language === "ja" ? "日 " : "英 ") : "") + version.label, "library-status");
    if (version.time) name.append(node("small", version.time, "library-time"));
    if (version.tokens && (!sharedTokens || version === ja)) {
      version.tokens.className = "library-time";
      name.append(version.tokens);
    }
    content.append(name);
  }
  return content;
}

function libraryCell(row, name) {
  const cell = row.insertCell();
  cell.dataset.label = name;
  return cell;
}
function drawProductionLibrary() {
  const rows = $("library-rows"), q = trim($("library-query").value).normalize("NFKC").toLocaleLowerCase();
  const format = $("library-format").value, lang = $("library-lang").value, rating = $("library-rating").value;
  const publication = $("library-publication").value, sort = $("library-sort").value;
  const {cases, youtube, placements} = productionLibrary;
  const visible = cases.filter((item) => {
    const langs = item.completedLangs || [];
    if (q && ![item.title, item.themeTitle].some((value) => String(value || "").normalize("NFKC").toLocaleLowerCase().includes(q))) return false;
    if (format && format !== (item.shortSourceTitle ? "short" : "landscape")) return false;
    if (lang === "both" ? langs.length !== 2 : lang === "none" ? langs.length > 0 : lang && !langs.includes(lang)) return false;
    if (rating !== "" && Number(rating) !== (item.rating || 0)) return false;
    const posted = youtube.filter((job) => job.caseId === item.id);
    const embedded = placements.some((placement) => placement.caseId === item.id);
    if (publication === "published") return embedded;
    if (publication === "unpublished") return !embedded;
    if (publication === "pending") return posted.some((job) => ["queued", "uploading", "processing", "unknown", "uncertain"].includes(job.status));
    return !publication || posted.some((job) => libraryVideoState(job) === publication);
  }).sort((left, right) => {
    let order = 0;
    if (sort === "rating") order = (right.rating || 0) - (left.rating || 0);
    if (sort === "theme") order = left.themeTitle.localeCompare(right.themeTitle, "ja");
    if (sort === "updated") order = millis(right.updated) - millis(left.updated);
    return order || millis(right.created) - millis(left.created);
  });
  const dateLabel = sort === "updated" ? "更新" : "作成";
  $("library-date-heading").textContent = dateLabel;
  $("library-count").textContent = visible.length + "件 / " + cases.length + "件";
  rows.replaceChildren();
  if (!visible.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 6;
    cell.className = "library-empty";
    cell.textContent = "該当する案件はありません。";
    return;
  }
  for (const item of visible) {
    const row = rows.insertRow();
    const work = node("div", null, "library-work");
    const url = safeUrl(item.thumbnail, true);
    const frame = node(url ? "button" : "span", null, "library-thumb");
    if (url) {
      frame.type = "button";
      frame.setAttribute("aria-label", "「" + item.title + "」を拡大試写");
      frame.setAttribute("aria-haspopup", "dialog");
      frame.dataset.previewCase = item.id;
      frame.onclick = () => openLibraryPreview(item);
      const mark = node("span", "▶", "library-thumb-play");
      mark.setAttribute("aria-hidden", "true");
      frame.append(mark);
    }
    if (url) {
      const img = node("img");
      img.alt = ""; img.src = url; img.loading = "lazy"; img.decoding = "async";
      img.onerror = () => img.remove();
      frame.append(img);
    }
    const text = node("div", null, "library-work-text");
    const titleRow = node("div", null, "library-work-title");
    const title = node("a", item.title);
    title.href = caseHash(item.id);
    title.onclick = () => { productionLibrary.scroll[libraryViewName()] = window.scrollY; };
    titleRow.append(title);
    const adopted = [item.accepted?.ja && "日", item.accepted?.en && "英"].filter(Boolean);
    if (adopted.length) {
      titleRow.append(node("span", "採用済み（" + adopted.join("・") + "）", "library-adopted"));
    }
    const generating = item.activeRuns?.filter((run) => run.status === "running" && !run.scriptFirst);
    if (generating?.length) {
      const badge = node("span", "生成中", "library-generating");
      badge.title = generating.map((run) => run.progress).filter(Boolean).join(" ／ ") || "動画を生成しています";
      titleRow.append(badge);
    }
    text.append(titleRow, node("small", item.themeTitle + (item.shortSourceTitle ? " · ショート" : " · 横長")));
    work.append(frame, text);
    libraryCell(row, "").append(work);
    const model = libraryCell(row, "モデル・生成時間・トークン");
    model.className = "library-model-cell";
    model.append(libraryModels(item.models));
    libraryCell(row, "評価").append(node("span", item.rating ? "★ " + item.rating : "—", "library-score"));
    libraryCell(row, "YouTube").append(libraryStatuses(item.id, youtube, "YouTube"));
    libraryCell(row, "テーマ掲載").append(libraryStatuses(item.id, placements, "テーマ掲載"));
    libraryCell(row, dateLabel).textContent = when(sort === "updated" ? item.updated : item.created);
  }
}
async function openProductionLibrary(trash, version) {
  const [result, delivery] = await Promise.all([
    api("/api/cases" + (trash ? "?trash=1" : "")),
    api("/api/publication/status").catch(() => ({youtube: [], placements: []})),
  ]);
  if (version !== state.routeVersion) return;
  if (!trash) state.cases = result.items;
  Object.assign(productionLibrary, {
    trash, cases: result.items.filter((item) => !item.reference),
    youtube: delivery.youtube, placements: delivery.placements,
  });
  $("library-title").textContent = trash ? "ゴミ箱" : "制作一覧";
  $("library-active").setAttribute("aria-current", trash ? "false" : "page");
  $("library-trash").setAttribute("aria-current", trash ? "page" : "false");
  view("library"); drawProductionLibrary();
  document.title = (trash ? "ゴミ箱" : "制作一覧") + " | Plunode 映像制作室";
  requestAnimationFrame(() => window.scrollTo(0, productionLibrary.scroll[libraryViewName()]));
}
async function editLibraryItem(data, changes) {
  if (state.detail?.id !== data.id) return;
  const path = detailPath("/library");
  try {
    await api(path, changes);
    await refreshCases();
    if (state.detail?.id !== data.id) return;
    if (changes.action) location.hash = changes.action === "restore" ? "#library" : "#trash";
    else {
      await reloadDetail();
      if (state.detail?.id === data.id) {
        drawCaseOrganization(state.detail);
        $("case-rating").querySelector('[aria-pressed="true"]')?.focus();
        notify("作品の評価を保存しました。");
      }
    }
  } catch (error) { notify(error.message, true); }
}
function drawCaseOrganization(data) {
  $("case-organize").hidden = Boolean(data.reference);
  if (data.reference) {
    $("trash-impact").hidden = true;
    return;
  }
  const trashed = Boolean(data.trashedAt), stars = $("case-rating");
  $("case-library-back").href = trashed ? "#trash" : "#library";
  $("case-library-back").textContent = trashed ? "ゴミ箱へ戻る" : "制作一覧へ";
  drawProductionStars(stars, data.rating, trashed, (rating) => editLibraryItem(data, {rating}));
  $("case-trash-action").textContent = trashed ? "復元する" : "ゴミ箱へ";
  $("case-trash-action").hidden = data.purgeState === "purging";
  $("case-trash-action").onclick = () => editLibraryItem(data, {action: trashed ? "restore" : "trash"});
  const impact = data.purgeImpact, blocked = Boolean(impact?.blockers?.length), purge = $("case-purge-action");
  purge.hidden = !trashed; purge.disabled = blocked;
  purge.onclick = () => {
    if (window.confirm("「" + data.title + "」のローカル制作データを完全に削除しますか？")) {
      editLibraryItem(data, {action: "purge", confirm: true});
    }
  };
  $("trash-impact").hidden = !trashed;
  $("trash-impact").textContent = impact
    ? [Math.round(impact.bytes / 1048576) + " MB", impact.runCount + "試行", ...(impact.blockers || [])].join(" ・ ")
    : "ゴミ箱にある案件です。";
}
document.getElementById("library-filter").addEventListener("input", drawProductionLibrary);
document.getElementById("library-filter").addEventListener("submit", (event) => event.preventDefault());


function drawProductionStars(container, rating, disabled, save) {
  container.replaceChildren();
  for (let value = 1; value <= 7; value++) {
    const star = node("button", value <= rating ? "★" : "☆", "rating-star");
    star.type = "button";
    star.setAttribute("aria-label", value + "つ星");
    star.setAttribute("aria-pressed", String(value === rating));
    star.dataset.rating = String(value);
    star.disabled = Boolean(disabled);
    star.onclick = () => save(value === rating ? null : value, value);
    container.append(star);
  }
}

function closeLibraryPreview() {
  if ($("library-preview").open) $("library-preview").close();
}

function previewStars(open, disabled = false) {
  drawProductionStars($("library-preview-rating"), open.item.rating, disabled || open.item.trashedAt, async (rating, key) => {
    if (open.saving || libraryPreview !== open) return;
    open.saving = true;
    const feedback = $("library-preview-feedback");
    previewStars(open, true);
    try {
      const result = await api("/api/cases/" + encodeURIComponent(open.item.id) + "/library", {rating});
      open.item.rating = result.rating;
      const listed = productionLibrary.cases.find((item) => item.id === open.item.id);
      if (listed) listed.rating = result.rating;
      if (state.routeVersion === open.version && !$("library-view").hidden) drawProductionLibrary();
      if (libraryPreview === open) feedback.textContent = "評価を保存しました。";
    } catch (error) {
      if (libraryPreview === open) feedback.textContent = error.message;
    } finally {
      open.saving = false;
      if (libraryPreview === open) {
        previewStars(open);
        $("library-preview-rating").querySelector('[data-rating="' + key + '"]')?.focus();
      }
    }
  });
}

async function openLibraryPreview(item) {
  const dialog = $("library-preview"), video = $("library-preview-video"), status = $("library-preview-status");
  if (dialog.open) return;
  const open = {item, version: state.routeVersion, saving: false};
  libraryPreview = open;
  $("library-preview-title").textContent = item.title;
  $("library-preview-time").hidden = true;
  $("library-preview-feedback").textContent = "";
  $("library-preview-case").href = caseHash(item.id);
  status.textContent = "読み込み中…";
  video.hidden = true;
  dialog.classList.toggle("vertical", Boolean(item.shortSourceTitle));
  previewStars(open);
  dialog.showModal();
  try {
    const movie = await api("/api/cases/" + encodeURIComponent(item.id) + "/preview");
    if (libraryPreview !== open || !dialog.open) return;
    const videoUrl = safeUrl(movie.video, true);
    if (!videoUrl) throw new Error("試写できる完成映像がありません。");
    $("library-preview-title").textContent = (movie.title || item.title) + " ・ " + languageName[movie.language];
    const duration = generationTimeLabel(movie.timing);
    const tokens = tokenUsageDisplay(movie.tokenUsage);
    const metadata = $("library-preview-time");
    metadata.textContent = duration;
    if (tokens) metadata.append(duration ? "　·　" : "", tokens);
    metadata.hidden = !duration && !tokens;
    $("library-preview-case").href = caseHash(item.id) + "/" + encodeURIComponent(movie.runId) + "/" + encodeURIComponent(movie.language);
    status.textContent = "";
    video.hidden = false;
    setPlayer(video, videoUrl);
    video.play().catch(() => {});
  } catch (error) {
    if (libraryPreview === open) status.textContent = error.message;
  }
}

const libraryDialog = document.getElementById("library-preview");
let libraryBackdropDown = false;
libraryDialog.addEventListener("pointerdown", (event) => { libraryBackdropDown = event.target === libraryDialog; });
libraryDialog.addEventListener("click", (event) => {
  if (libraryBackdropDown && event.target === libraryDialog) closeLibraryPreview();
});
libraryDialog.addEventListener("close", () => {
  if (libraryDialog.open) return;
  const open = libraryPreview;
  libraryPreview = null;
  libraryBackdropDown = false;
  clearPlayer($("library-preview-video"));
  if (open?.version === state.routeVersion && !$("library-view").hidden) {
    [...$("library-rows").querySelectorAll("[data-preview-case]")]
      .find((button) => button.dataset.previewCase === open.item.id)?.focus({preventScroll: true});
  }
});
document.getElementById("library-preview-close").addEventListener("click", closeLibraryPreview);
document.getElementById("library-preview-case").addEventListener("click", closeLibraryPreview);
document.getElementById("library-refresh").addEventListener("click", async function () {
  this.disabled = true;
  productionLibrary.scroll[libraryViewName()] = window.scrollY;
  try { await openProductionLibrary(productionLibrary.trash, state.routeVersion); }
  catch (error) { notify(error.message, true); }
  finally { this.disabled = false; }
});
