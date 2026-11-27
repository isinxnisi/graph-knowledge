"use strict";

const productionLibrary = { cases: [], youtube: [], placements: [], trash: false, scroll: {library: 0, trash: 0} };
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
    if (sort === "rating" && left.rating !== right.rating) return (right.rating || 0) - (left.rating || 0);
    if (sort === "theme") return left.themeTitle.localeCompare(right.themeTitle, "ja");
    return millis(right.updated) - millis(left.updated);
  });
  $("library-count").textContent = visible.length + "件 / " + cases.length + "件";
  rows.replaceChildren();
  if (!visible.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 5;
    cell.className = "library-empty";
    cell.textContent = "該当する案件はありません。";
    return;
  }
  for (const item of visible) {
    const row = rows.insertRow();
    const preview = node("a", null, "library-work");
    preview.href = caseHash(item.id);
    preview.onclick = () => { productionLibrary.scroll[libraryViewName()] = window.scrollY; };
    const frame = node("span", null, "library-thumb");
    const url = safeUrl(item.thumbnail, true);
    if (url) {
      const img = node("img");
      img.alt = ""; img.src = url; img.loading = "lazy"; img.decoding = "async";
      img.onerror = () => img.remove();
      frame.append(img);
    }
    const text = node("span", null, "library-work-text");
    text.append(node("strong", item.title), node("small", item.themeTitle + (item.shortSourceTitle ? " · ショート" : " · 横長")));
    preview.append(frame, text);
    libraryCell(row, "").append(preview);
    libraryCell(row, "評価").append(node("span", item.rating ? "★ " + item.rating : "—", "library-score"));
    libraryCell(row, "YouTube").append(libraryStatuses(item.id, youtube, "YouTube"));
    libraryCell(row, "テーマ掲載").append(libraryStatuses(item.id, placements, "テーマ掲載"));
    libraryCell(row, "更新").textContent = when(item.trashedAt || item.updated);
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
  stars.replaceChildren();
  for (let value = 1; value <= 5; value++) {
    const star = node("button", value <= data.rating ? "★" : "☆", "rating-star");
    star.type = "button";
    star.setAttribute("aria-label", value + "つ星");
    star.setAttribute("aria-pressed", String(value === data.rating));
    star.disabled = trashed;
    star.onclick = () => editLibraryItem(data, {rating: value === data.rating ? null : value});
    stars.append(star);
  }
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
