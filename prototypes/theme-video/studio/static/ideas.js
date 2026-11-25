"use strict";

const ideaStatusLabels = { candidate: "制作候補", later: "あとで作る", used: "制作あり" };

function ideaLibraryHash(themeId) {
  return themeId ? "#ideas/theme/" + encodeURIComponent(themeId) : "#ideas";
}

function describeIdea(idea) {
  const card = node("article", null, "idea-card");
  const status = idea.origin === "reference" ? "品質見本" : ideaStatusLabels[idea.status];
  card.append(node("p", [idea.themeTitle, "第" + idea.revision + "版", status].join(" ／ "), "idea-meta"));
  card.append(node("h2", idea.title));
  const description = node("dl");
  for (const [label, value] of [["冒頭", idea.opening], ["観終わったときの発見", idea.payoff], ["必要な資料・素材", idea.needs]]) {
    if (value) description.append(node("dt", label), node("dd", value));
  }
  if (description.childElementCount) card.append(description);
  if (idea.sources?.length) {
    const sources = node("details", null, "idea-sources");
    sources.append(node("summary", "根拠資料（" + idea.sources.length + "件）"));
    const links = node("div", null, "source-list");
    for (const source of idea.sources) links.append(externalLink(source.url, source.title));
    sources.append(links);
    card.append(sources);
  }
  if (idea.origin !== "reference" && idea.cases?.length) {
    const productions = node("section", null, "idea-productions");
    productions.append(node("h3", "この案の制作案件（" + idea.cases.length + "件）"));
    const list = node("ol");
    list.reversed = true;
    for (const item of idea.cases) {
      const label = idea.origin === "previous" && item.id === idea.caseId ? "元の制作" : "制作 " + item.number;
      const title = item.title && item.title !== idea.title ? "　" + item.title : "";
      const link = node("a", label + title, "text-link");
      link.href = caseHash(item.id);
      const row = node("li");
      row.append(link);
      const info = [when(item.created), item.model && modelLabel(item), jobName[item.status] || item.status].filter(Boolean);
      if (info.length) row.append(node("span", info.join(" ／ ")));
      list.append(row);
    }
    productions.append(list);
    card.append(productions);
  }
  return card;
}

function drawNewIdeaSelection() {
  const idea = state.chosenIdea;
  $("new-theme-fields").hidden = $("new-theme-fields").disabled = Boolean(idea);
  $("new-brief-field").hidden = $("brief").disabled = Boolean(idea);
  $("generate-ideas").hidden = Boolean(idea);
  $("new-video").className = idea ? "primary" : "secondary";
  $("new-title").textContent = idea ? "この案で新しい制作を始める" : "テーマから動画をつくる";
  $("new-settings-label").textContent = idea ? "新しい案件の制作設定" : "動画の企画";
  const chosen = $("chosen-idea");
  chosen.hidden = !idea;
  chosen.replaceChildren();
  if (idea) {
    const back = node("a", "このテーマの案を選び直す", "text-link");
    back.href = ideaLibraryHash(idea.themeId);
    chosen.append(describeIdea(idea), back);
    if (idea.cases?.length) chosen.append(node("p", "新しく生成する台本と映像は、別の制作案件に保存されます。", "subtle"));
  }
}

function drawIdeaLibrary() {
  const { themeId, items, batches } = state.ideaLibrary;
  const themes = new Map();
  for (const item of [...items, ...batches]) themes.set(item.themeId, item.themeTitle);
  if (themeId && !themes.has(themeId)) themes.set(themeId, state.chosen?.id === themeId ? state.chosen.title : themeId);
  $("ideas-theme").replaceChildren(option("", "すべてのテーマ"), ...Array.from(themes, ([id, title]) => option(id, title)));
  $("ideas-theme").value = themeId;

  const visibleBatches = batches.filter((b) => !themeId || themeId === b.themeId);
  const active = visibleBatches.filter(pending);
  const history = visibleBatches.filter((b) => !pending(b));
  const batchBox = $("idea-batches");
  batchBox.replaceChildren();
  for (const batch of active) {
    batchBox.append(node("p", batch.themeTitle + "（第" + batch.revision + "版）の案を" +
      (batch.status === "queued" ? "生成待ち" : "生成中") + "…", "status-box"));
  }
  if (history.length) {
    const details = node("details", null, "idea-history");
    details.append(node("summary", "案の生成履歴（" + history.length + "件）"));
    for (const batch of history) {
      const note = batch.status === "done" ? (Number.isInteger(batch.count) ? batch.count + "案を保存" : "保存済み")
        : (jobName[batch.status] || batch.status) + (batch.error ? "　" + batch.error : "");
      const meta = [batch.themeTitle + " 第" + batch.revision + "版", when(batch.created), note].filter(Boolean);
      details.append(node("p", meta.join(" ／ "), "review-note"));
    }
    batchBox.append(details);
    const last = visibleBatches[0];
    if (last?.status === "failed" || last?.status === "interrupted") {
      batchBox.prepend(node("p", last.themeTitle + " の案の生成を完了できませんでした。" + (last.error || ""), "status-box bad"));
    } else if (last?.status === "done" && last.count === 0) {
      batchBox.prepend(node("p", last.themeTitle + "で新しく保存された案はありません。", "subtle"));
    }
  }

  const status = $("ideas-status").value;
  const shown = items.filter((i) => (!themeId || i.themeId === themeId) && (!status || i.status === status));
  const list = $("idea-list");
  list.replaceChildren();
  if (!shown.length) {
    list.append(node("p", items.length ? "この条件の動画案はまだありません。" : "保存した動画案はまだありません。", "subtle"));
  }
  for (const idea of shown) {
    const card = describeIdea(idea);
    const actions = node("div", null, "idea-actions");
    if (idea.origin === "reference") {
      const link = node("a", "品質見本を開く", "secondary small");
      link.href = caseHash(idea.caseId);
      actions.append(link);
    } else {
      const select = node("a", "この案で新しく制作", "primary small");
      select.href = "#new/idea/" + encodeURIComponent(idea.id);
      actions.append(select);
    }
    if (idea.origin === "generated" && idea.status !== "used") {
      const later = idea.status === "later";
      const defer = node("button", later ? "候補に戻す" : "あとで作る", "quiet small");
      defer.type = "button";
      defer.onclick = async () => {
        const version = state.routeVersion;
        defer.disabled = true;
        try {
          await api("/api/ideas/" + encodeURIComponent(idea.id) + "/status", { status: later ? "candidate" : "later" });
          if (version === state.routeVersion) await refreshIdeaLibrary(themeId, version);
        } catch (err) {
          if (version === state.routeVersion) notify(err.message, true);
        } finally { defer.disabled = false; }
      };
      actions.append(defer);
    }
    card.append(actions);
    list.append(card);
  }
}

async function refreshIdeaLibrary(themeId, version) {
  const read = ++state.ideaRead;
  const data = await api("/api/ideas");
  if (version !== state.routeVersion || read !== state.ideaRead) return;
  const library = { themeId, items: data.items || [], batches: data.batches || [] };
  if (JSON.stringify(library) !== JSON.stringify(state.ideaLibrary)) {
    state.ideaLibrary = library;
    drawIdeaLibrary();
  }
  clearTimeout(state.poll);
  if (library.batches.some((b) => (!themeId || themeId === b.themeId) && pending(b))) {
    state.poll = setTimeout(() => {
      refreshIdeaLibrary(themeId, version).catch((err) => {
        if (version === state.routeVersion) notify(err.message, true, route);
      });
    }, 2500);
  }
}

async function openIdeaLibrary(hash, version) {
  const themeId = hash === "#ideas" ? "" : decodeURIComponent(hash.slice("#ideas/theme/".length));
  state.ideaLibrary = null;
  await refreshIdeaLibrary(themeId, version);
  if (version !== state.routeVersion) return;
  view("ideas");
  document.title = "保存した動画案 | Plunode 映像制作室";
}
