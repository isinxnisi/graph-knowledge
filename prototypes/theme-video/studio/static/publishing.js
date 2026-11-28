"use strict";

let youtubeEditionTarget = null;
let captionTimer = null;
let placementTarget = null;
let placementVersion = 0;

function publishingButton(label, handler, kind = "secondary small") {
  const button = node("button", label, kind);
  button.type = "button";
  button.onclick = async () => {
    if (button.disabled) return;
    button.disabled = true;
    try { await handler(); }
    catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  };
  return button;
}

function publishField(parent, label, name, control) {
  const wrapper = node("label", label);
  control.name = name;
  wrapper.append(control);
  parent.append(wrapper);
  return control;
}
function publishInput(parent, label, name, value = "", type = "text") {
  const input = node("input");
  input.type = type; input.value = value;
  return publishField(parent, label, name, input);
}
function publishSelect(parent, label, name, items, value) {
  const select = node("select");
  select.append(...items.map(([id, title]) => option(id, title)));
  if (value !== undefined) select.value = value;
  return publishField(parent, label, name, select);
}
const privacyChoices = [["unlisted", "限定公開"], ["private", "非公開"], ["public", "公開"]];

function publishCheck(parent, label, name, checked = false) {
  const input = node("input");
  input.type = "checkbox"; input.name = name; input.checked = Boolean(checked);
  const wrap = node("label", null, "publishing-check");
  wrap.append(input, document.createTextNode(label));
  parent.append(wrap);
  return input;
}

async function openYoutubeSettings(version = state.routeVersion) {
  const data = await api("/api/youtube/settings");
  if (version !== state.routeVersion) return;
  const desk = $("youtube-setup");
  desk.replaceChildren();
  const status = new URLSearchParams(location.search).get("youtube");
  if (status) {
    const href = new URL(location.href);
    href.searchParams.delete("youtube");
    history.replaceState(null, "", href);
    notify(status === "connected" ? "接続したチャンネルを確認してください。"
      : status === "cancelled" ? "Googleとの接続を取り消しました。" : "接続できませんでした。Google側で選んだチャンネル、許可した権限、接続URLを確認してください。",
    status === "failed");
  }
  const form = node("form", null, "action-form");
  form.onsubmit = (event) => event.preventDefault();
  form.append(node("h2", "Google Cloudの接続"));
  form.append(node("p", "YouTube Data API v3を有効にして、ウェブ アプリケーションのOAuthクライアントを作成します。承認済みのリダイレクトURIに次のURLを登録してください。External／Testingでは、投稿するGoogleアカウントをテストユーザーに追加します。", "subtle"));
  const redirect = publishInput(form, "リダイレクトURI", "redirectUri", data.redirectUri || "");
  redirect.readOnly = true;
  const credentials = node("div", null, "model-settings");
  form.append(credentials);
  const clientId = publishInput(credentials, "クライアントID", "clientId");
  const secret = publishInput(credentials, "クライアントシークレット", "clientSecret", "", "password");
  clientId.autocomplete = "off"; secret.autocomplete = "new-password";
  const privacy = publishSelect(form, "新しい投稿の公開範囲", "privacy", privacyChoices, data.defaultPrivacy);
  form.append(publishingButton("設定を保存", async () => {
    const update = {defaultPrivacy: privacy.value};
    if (clientId.value || secret.value) Object.assign(update, {clientId: trim(clientId.value), clientSecret: secret.value});
    await api("/api/youtube/settings", update);
    await openYoutubeSettings(version);
    notify("YouTube設定を保存しました。");
  }, "primary small"));
  desk.append(form);
  for (const lang of ["ja", "en"]) {
    const channel = data.channels?.[lang];
    const section = node("section", null, "action-form");
    section.append(node("h2", languageName[lang] + "チャンネル"));
    section.append(node("p", channel ? [channel.title, channel.handle, channel.id].filter(Boolean).join(" ・ ") : "未接続"));
    if (!data.configured) {
      section.append(node("p", "先にGoogle Cloudの接続設定を保存してください。", "subtle"));
    } else if (data.redirectUri && new URL(data.redirectUri).origin !== location.origin) {
      section.append(externalLink(new URL("/#publishing", data.redirectUri).href, "外部用の制作室でGoogleに接続"));
    } else {
      const connect = async (manage) => {
        const result = await api("/api/youtube/channels/" + lang + "/connect", {manage});
        const address = new URL(result.url);
        if (address.origin !== "https://accounts.google.com") throw new Error("Google OAuthの接続先を確認してください。");
        location.assign(address.href);
      };
      section.append(publishingButton(channel ? "Googleに再接続" : "Googleに接続", () => connect(Boolean(channel?.manage))));
      if (channel && !channel.manage) section.append(publishingButton("公開範囲・字幕の管理を許可", () => connect(true)));
      if (channel) section.append(publishingButton("接続を解除", async () => {
        if (!window.confirm(languageName[lang] + "チャンネルの制作室との接続を解除しますか？")) return;
        await api("/api/youtube/channels/" + lang + "/disconnect", {});
        await openYoutubeSettings(version);
      }, "quiet small"));
    }
    const eligibility = publishSelect(section, "YouTube Studioで確認した機能資格", "eligibility",
      [["", "未確認"], ["false", "標準"], ["true", "中級者以上"]], channel?.intermediate == null ? "" : String(channel.intermediate));
    eligibility.disabled = !channel;
    eligibility.options[0].disabled = true;
    eligibility.onchange = async () => {
      try { await api("/api/youtube/settings", {intermediate: {[lang]: eligibility.value === "true"}}); }
      catch (error) { notify(error.message, true); }
    };
    section.append(node("p", "15分超の投稿とカスタムサムネイルには中級者機能が必要です。YouTube Studio → 設定 → チャンネル → 機能の利用資格で確認できます。", "subtle"));
    desk.append(section);
  }
  view("publishing");
  document.title = "YouTube設定 | Plunode 映像制作室";
}

function closeYoutubeEdition() {
  youtubeEditionTarget = null;
  clearTimeout(captionTimer);
  const panel = $("youtube-edition");
  if (!panel) return;
  const video = panel.querySelector("video");
  if (video) clearPlayer(video);
  panel.hidden = true;
}
function drawPublishingActions(run, lang) {
  const detail = state.detail, target = youtubeEditionTarget;
  const available = detail && !detail.reference && !detail.trashedAt;
  const open = $("upload-open");
  open.hidden = !available || !run?.editions?.[lang]?.video;
  $("placement-open").hidden = !available || !detail.themeId;
  $("placement-open").onclick = () => {
    placementTarget = {id: detail.themeId, title: detail.themeTitle};
  };
  if (target && (target.caseId !== detail?.id || target.runId !== run?.id || target.lang !== lang)) closeYoutubeEdition();
  if (!open.hidden) open.onclick = () => {
    $("player").pause();
    $("compare-player").pause();
    showYoutubeEdition({caseId: detail.id, runId: run.id, lang}).catch((error) => notify(error.message, true));
  };
}
function editionYoutubePath(target) {
  return "/api/cases/" + target.caseId + "/runs/" + target.runId + "/" + target.lang + "/youtube";
}
function jobYoutubePath(job, action) {
  return "/api/youtube/jobs/" + encodeURIComponent(job.id) + "/" + action;
}

function addYoutubeReceipt(panel, job, target, channel) {
  const group = node("section", null, "youtube-receipt");
  const label = youtubeLabels[libraryVideoState(job)] || "確認待ち";
  group.append(node("h3", label + (job.videoId ? " ・ " + job.videoId : "")));
  if (job.videoId && /^[A-Za-z0-9_-]{11}$/.test(job.videoId)) {
    group.append(externalLink("https://www.youtube.com/watch?v=" + job.videoId, "YouTubeで確認 ↗"), document.createTextNode("　"));
    group.append(externalLink("https://studio.youtube.com/video/" + job.videoId + "/edit", "YouTube Studio ↗"));
  }
  if (job.mediaVariant === "captioned") group.append(node("p", "追加字幕を入れた投稿用版", "subtle"));
  if (job.error) group.append(node("p", job.error, "subtle"));
  if (job.captions || job.thumbnail) group.append(node("p", [job.captions && "字幕 " + job.captions,
    job.thumbnail && "サムネイル " + job.thumbnail].filter(Boolean).join(" ／ "), "subtle"));
  const action = async (kind, params = {}) => {
    await api(jobYoutubePath(job, kind), params);
    await showYoutubeEdition(target);
  };
  if (job.videoId) group.append(publishingButton("YouTubeの状態を確認", () => action("sync")));
  if (job.canCancel) group.append(publishingButton("送信を取り消す", async () => {
    if (window.confirm("この送信を取り消しますか？")) await action("cancel");
  }));
  if (["failed", "attention"].includes(job.status) && !job.videoId) group.append(publishingButton("送信を再開", () => action("retry")));
  if (["unknown", "uncertain"].includes(job.status)) {
    group.append(node("p", "結果が未確定です。YouTube Studioで投稿済み一覧を確認し、該当動画があればIDを入力してください。", "subtle"));
    const id = publishInput(group, "照合する動画ID", "videoId");
    const confirmed = publishCheck(group, "実際の映像と言語を確認済み", "confirmLanguage");
    group.append(publishingButton("照合", () => action("reconcile", {videoId: trim(id.value), confirmLanguage: confirmed.checked})));
  }
  if (job.videoId && channel?.manage) {
    const privacy = publishSelect(group, "この動画の公開範囲", "privacy", privacyChoices, job.privacy);
    group.append(publishingButton("公開範囲を変更", async () => {
      if (privacy.value !== job.privacy && window.confirm("この動画を「" + privacy.selectedOptions[0].textContent + "」に変更しますか？")) {
        await action("privacy", {privacy: privacy.value});
      }
    }));
    if (job.status === "ready") group.append(publishingButton("この版のSRTを送る", () => action("captions")));
  } else if (job.videoId) {
    group.append(node("p", "制作室から公開範囲を変更したり字幕を送るには、YouTube設定で管理を許可してください。YouTube Studioで編集した場合は「状態を確認」で反映できます。", "subtle"));
  }
  if (job.videoId && job.status === "ready" && channel?.intermediate !== false) {
    const file = publishInput(group, "カスタムサムネイル（PNG / JPEG）", "thumbnail", "", "file");
    file.accept = "image/png,image/jpeg";
    group.append(publishingButton("サムネイルを送る", async () => {
      const image = file.files[0];
      if (!image || !["image/png", "image/jpeg"].includes(image.type) || image.size > 50_000_000) {
        throw new Error("制作室から送るサムネイルは50 MB以内のPNGまたはJPEGを選んでください。");
      }
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject; reader.readAsDataURL(image);
      });
      await action("thumbnail", {imageBase64: encoded, contentType: image.type});
    }));
  }
  panel.append(group);
}

function mountUploadPreview(panel, target, edition) {
  const url = editionYoutubePath(target).replace(/youtube$/, "upload-captions");
  const preview = node("section", null, "panel");
  preview.append(node("h3", "投稿する映像の試写"),
    node("p", "消音で始まります。再生すると、投稿するMP4に入っている文字を確認できます。", "subtle"));
  const selected = publishSelect(preview, "投稿する映像", "mediaVariant",
    [["original", "元のMP4"]], "original");
  const screen = node("video");
  screen.controls = true; screen.muted = true; screen.playsInline = true; screen.preload = "metadata";
  screen.setAttribute("aria-label", "投稿する映像");
  const disableTextTracks = () => {
    for (const track of screen.textTracks) track.mode = "disabled";
  };
  screen.addEventListener("loadedmetadata", disableTextTracks);
  screen.textTracks.addEventListener("addtrack", disableTextTracks);
  const status = node("p", null, "subtle");
  status.setAttribute("role", "status");
  let captionedVideo;
  const updatePlayer = () => setPlayer(screen, selected.value === "captioned" ? captionedVideo : edition.video);
  selected.addEventListener("change", updatePlayer);
  updatePlayer();

  const run = publishingButton("SRTから字幕を入れたMP4を書き出す", async () => {
    await api(url, {});
    await poll(true);
  }, "secondary small");
  run.hidden = true;
  preview.append(screen, run, status);
  panel.append(preview);

  async function poll(selectCaptioned = false) {
    const result = await api(url);
    if (youtubeEditionTarget !== target || !preview.isConnected) return;
    captionedVideo = result.status === "ready" ? result.video : null;
    if (captionedVideo && !selected.options[1]) selected.add(option("captioned", "字幕を追加したMP4"));
    if (!captionedVideo) selected.options[1]?.remove();
    if (captionedVideo && selectCaptioned) selected.value = "captioned";
    updatePlayer();
    const inProgress = ["queued", "running"].includes(result.status);
    run.hidden = !result.hasSubtitles || inProgress || Boolean(captionedVideo);
    status.textContent = {
      queued: "字幕入りMP4の書き出し待ち",
      running: "字幕入りMP4を書き出し中",
      ready: "字幕を追加したMP4を選んで試写できます。元のMP4と切り替えて確認できます。",
    }[result.status] || result.error || (result.hasSubtitles
      ? "元の映像の字幕が足りない場合は、SRTから字幕を入れたMP4を作れます。"
      : "この版に字幕を書き出すためのSRTはありません。");
    clearTimeout(captionTimer);
    if (inProgress) captionTimer = setTimeout(() => {
      poll(selectCaptioned).catch(showPreviewError);
    }, 3000);
  }
  function showPreviewError(error) {
    status.textContent = error.message;
  }
  poll().catch(showPreviewError);
  return selected;
}

async function showYoutubeEdition(target) {
  youtubeEditionTarget = target;
  clearTimeout(captionTimer);
  const panel = $("youtube-edition");
  const path = editionYoutubePath(target);
  const [settings, draft, history] = await Promise.all([
    api("/api/youtube/settings"), api(path), api("/api/cases/" + target.caseId + "/youtube"),
  ]);
  if (youtubeEditionTarget !== target) return;
  const run = currentRuns().find((item) => item.id === target.runId);
  const edition = run?.editions?.[target.lang];
  if (!edition?.video) { closeYoutubeEdition(); return; }
  const channel = settings.channels?.[target.lang];
  const items = history.items.filter((item) => item.runId === target.runId && item.lang === target.lang);
  const receipts = node("section");
  const drawReceipts = (jobs) => {
    receipts.replaceChildren();
    for (const job of jobs) addYoutubeReceipt(receipts, job, target, channel);
  };
  const previousPlayer = panel.querySelector("video");
  if (previousPlayer) clearPlayer(previousPlayer);
  panel.replaceChildren(node("h2", languageName[target.lang] + "版のYouTube投稿"),
    node("p", "試行 " + runNumber(target.runId) + " ・ " + run?.plan?.titles?.[target.lang], "form-target"),
    publishingButton("閉じる", closeYoutubeEdition, "quiet small"), publishingButton("送信履歴を更新", async () => {
      const current = await api("/api/cases/" + target.caseId + "/youtube");
      if (youtubeEditionTarget === target) drawReceipts(current.items.filter((job) => job.runId === target.runId && job.lang === target.lang));
    }, "quiet small"), receipts);
  drawReceipts(items);
  if (!channel) {
    const link = node("a", languageName[target.lang] + "チャンネルを接続する", "text-link");
    link.href = "#publishing";
    panel.append(node("p", "投稿先のYouTubeチャンネルが未接続です。"), link);
  }
  const mediaVariant = mountUploadPreview(panel, target, edition);
  const form = node("form", null, "youtube-draft");
  panel.append(form);
  form.onsubmit = (event) => event.preventDefault();
  form.append(node("p", channel ? "投稿先　" + channel.title + " " + (channel.handle || channel.id) : "投稿先　未接続"));
  const title = publishInput(form, "タイトル", "title", draft.title || "");
  title.maxLength = 100; title.required = true;
  const description = publishField(form, "説明", "description", node("textarea"));
  description.value = draft.description || ""; description.rows = 4;
  const privacy = publishSelect(form, "公開範囲", "privacy", privacyChoices, draft.privacy || settings.defaultPrivacy);
  const extra = node("details", null, "panel");
  extra.append(node("summary", "投稿の詳細設定（タグ・カテゴリ・視聴者）"));
  form.append(extra);
  const tags = publishInput(extra, "タグ（カンマ区切り）", "tags", (draft.tags || []).join(", "));
  extra.append(publishingButton("作品情報からタグを入力", () => {
    tags.value = (draft.suggestedTags || []).join(", ");
    tags.focus();
  }, "quiet small"));
  const categories = [["27", "教育"], ["28", "科学と技術"], ["24", "エンターテインメント"], ["22", "ブログ"], ["1", "映画とアニメ"]];
  const savedCategory = String(draft.categoryId || "27");
  if (!categories.some(([id]) => id === savedCategory)) categories.push([savedCategory, "カテゴリ " + savedCategory]);
  const category = publishSelect(extra, "カテゴリ", "categoryId", categories, savedCategory);
  const audience = publishSelect(extra, "子ども向けの指定", "madeForKids",
    [["false", "子ども向けではない"], ["true", "子ども向け"]], draft.madeForKids === true ? "true" : "false");
  const checks = node("div", null, "publishing-checks");
  form.append(checks);
  const synthetic = publishCheck(checks, "申告が必要な合成・改変コンテンツを含む", "containsSyntheticMedia", draft.containsSyntheticMedia);
  const promotion = publishCheck(checks, "有料プロモーションを含む", "paidPromotion", draft.paidPromotion);
  const embed = publishCheck(checks, "外部サイトでの埋め込みを許可する", "embeddable", draft.embeddable !== false);
  const notifySubscribers = publishCheck(checks, "登録者に通知する", "notifySubscribers", draft.notifySubscribers);
  const language = target.lang;
  const formValue = () => ({
    title: trim(title.value), description: description.value,
    tags: tags.value.split(",").map(trim).filter(Boolean), categoryId: category.value,
    defaultLanguage: language, audioLanguage: language, privacy: privacy.value,
    madeForKids: audience.value === "true",
    containsSyntheticMedia: synthetic.checked, paidPromotion: promotion.checked,
    embeddable: embed.checked, notifySubscribers: notifySubscribers.checked,
  });
  const notices = node("p", null, "subtle");
  notices.append(document.createTextNode("YouTubeへの投稿には、"), externalLink("https://www.youtube.com/t/terms", "YouTubeの利用規約"),
    document.createTextNode("と"), externalLink("https://policies.google.com/privacy", "Googleのプライバシーポリシー"),
    document.createTextNode("が適用されます。投稿は他者の著作権やプライバシーを尊重してください。"));
  form.append(notices);
  const actions = node("div", null, "actions");
  const save = publishingButton("投稿の下書きを保存", async () => {
    await api(path + "/draft", formValue()); notify("投稿の下書きを保存しました。");
  });
  actions.append(save);
  if (channel) actions.append(publishingButton("選んだ公開範囲で投稿", async () => {
    if (!form.reportValidity()) return;
    if (!window.confirm("「" + mediaVariant.selectedOptions[0].textContent + "」を " + channel.title +
        " に「" + privacy.selectedOptions[0].textContent + "」で投稿しますか？")) return;
    const result = await api(path + "/submit", {metadata: formValue(), channelId: channel.id,
      mediaVariant: mediaVariant.value});
    if (result.caseId !== target.caseId || result.runId !== target.runId) {
      const link = node("a", "同じ映像の送信記録を開く", "text-link");
      link.href = caseHash(result.caseId) + "/" + result.runId + "/" + result.lang;
      notify("このチャンネルには同じ映像の送信記録があります。");
      $("notice").append(link);
      return;
    }
    await showYoutubeEdition(target);
    notify("YouTubeへの送信を受け付けました。");
  }, "primary small"));
  form.append(actions);
  if (channel) {
    const existing = node("details", null, "panel");
    existing.append(node("summary", "YouTube Studioで投稿済みの動画を登録"));
    const input = publishInput(existing, "YouTube動画ID", "videoId");
    const confirmed = publishCheck(existing, "実際の映像と言語を確認済み", "confirmLanguage");
    existing.append(publishingButton("この版と紐づける", async () => {
      await api(path + "/register", {videoId: trim(input.value), channelId: channel.id, confirmLanguage: confirmed.checked});
      await showYoutubeEdition(target);
    }));
    panel.append(existing);
  }
  panel.hidden = false;
}


function placementEnvironmentLabel(environment) {
  return environment === "production" ? "正式" : "β";
}
function placementId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
}
function placementKey(position) {
  return position.kind === "theme" ? "theme" : JSON.stringify([position.kind, position.id, position.revision]);
}
function placementVideoName(entry) {
  return trim(entry?.title || entry?.metadata?.title || entry?.caseTitle);
}
function placementVideoEdition(placement, entries, lang, videoId) {
  const entry = entries.find((item) => item.lang === lang && item.videoId === videoId);
  const observed = placement.videoStatus?.[lang + ":" + videoId]?.edition;
  return {...observed, ...entry, videoId, lang, title: placementVideoName(entry) || placementVideoName(observed),
    thumbnail: entry?.thumbnail || observed?.thumbnail};
}
function placementSlotTitle(slot, placement, entries) {
  if (slot.kind === "image") {
    const image = placement.imageCandidates.find((item) => item.id === slot.imageId);
    return image?.images.ja?.alt || image?.images.en?.alt || "テーマ画像";
  }
  const titles = ["ja", "en"].flatMap((lang) => {
    const edition = slot.editions[lang];
    const title = edition && placementVideoName(placementVideoEdition(placement, entries, lang, edition.videoId));
    return title ? [title] : [];
  });
  return titles[0] || (Object.keys(slot.editions).length ? "登録済みの作品" : "新しい作品");
}
function placementVideoInfo(item) {
  const card = node("span", null, "placement-video-info");
  const thumb = node("span", null, "placement-video-thumb");
  const address = safeUrl(item.thumbnail);
  if (address) {
    const url = new URL(address);
    if (url.origin === location.origin || url.origin === "https://i.ytimg.com") {
      const image = node("img");
      image.src = url.href; image.alt = ""; image.loading = "lazy"; image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => image.remove(), {once:true});
      thumb.append(image);
    }
  }
  const title = placementVideoName(item);
  const context = [...new Set([item.themeTitle, item.caseTitle].filter((value) => value && value !== title))];
  const note = [item.format === "short" ? "ショート" : item.format === "landscape" ? "横長" : "",
    item.attempt ? "試行 " + item.attempt : "", youtubeLabels[libraryVideoState(item)] || youtubeLabels[item.privacy],
    item.source === "existing" ? "YouTubeから登録" : ""].filter(Boolean);
  const copy = node("span", null, "placement-video-copy");
  copy.append(node("strong", title || "登録済みの動画"));
  if (context.length) copy.append(node("small", context.join(" ・ ")));
  if (note.length) copy.append(node("small", note.join(" ・ ")));
  if (!title) copy.append(node("small", item.videoId));
  card.append(thumb, copy);
  return card;
}
function openPlacementPicker(trigger, placement, lang, currentVideo, entries, choose) {
  const title = languageName[lang] + "の掲載作品を選ぶ";
  const dialog = node("dialog", null, "placement-picker");
  dialog.setAttribute("aria-label", title);
  const body = node("div", null, "placement-picker-body");
  const header = node("header", null, "inline");
  header.append(node("h3", title), publishingButton("閉じる", () => dialog.close(), "quiet small"));
  const field = node("div", null, "placement-picker-search");
  const query = publishInput(field, "作品名・テーマ名で検索", "work", "", "search");
  const results = node("div", null, "placement-picker-results");
  const status = node("small", null, "subtle");
  status.setAttribute("role", "status");
  body.append(header, field, status, results);
  dialog.append(body);

  const candidates = entries.filter((entry) => entry.lang === lang && entry.canEmbed && entry.videoId)
    .sort((left, right) => Number(right.themeId === placement.themeId) - Number(left.themeId === placement.themeId));
  const fold = (value) => trim(value).normalize("NFKC").toLocaleLowerCase();
  const draw = () => {
    const terms = fold(query.value).split(/\s+/).filter(Boolean);
    const visible = candidates.filter((entry) => {
      const searchText = fold([placementVideoName(entry), entry.caseTitle, entry.themeTitle, entry.videoId].join(" "));
      return terms.every((term) => searchText.includes(term));
    });
    status.textContent = visible.length + "件";
    results.replaceChildren();
    for (const entry of visible) {
      const button = publishingButton(null, () => {
        choose(entry);
        dialog.close();
      }, "placement-picker-option");
      button.setAttribute("aria-pressed", String(entry.videoId === currentVideo));
      button.append(placementVideoInfo(entry));
      results.append(button);
    }
    if (!visible.length) results.append(node("p", candidates.length ? "検索に一致する作品はありません。" :
      "この言語で掲載できる作品はありません。YouTubeの公開範囲と埋め込みの許可を投稿履歴で確認できます。", "subtle"));
  };
  query.addEventListener("input", draw);

  let backdropDown = false;
  dialog.addEventListener("pointerdown", (event) => { backdropDown = event.target === dialog; });
  dialog.addEventListener("click", (event) => {
    if (backdropDown && event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (trigger.isConnected) trigger.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog);
  draw();
  dialog.showModal();
  query.focus();
}
function placementVideoField(parent, placement, lang, slot, entries, editable, changed) {
  const box = node("section", null, "placement-video-field");
  const header = node("div", null, "inline");
  const selected = node("div", null, "placement-video-selected");
  const select = publishingButton("作品を選ぶ", () => {
    openPlacementPicker(select, placement, lang, slot.editions[lang]?.videoId, entries, (item) => {
      if (slot.editions[lang]?.videoId === item.videoId) return;
      if (!Object.keys(slot.editions).length && ["landscape", "short"].includes(item.format)) slot.format = item.format;
      slot.editions[lang] = {videoId:item.videoId};
      render();
      changed();
    });
  }, "quiet small");
  select.setAttribute("aria-haspopup", "dialog");
  const remove = publishingButton("外す", () => {
    delete slot.editions[lang];
    render();
    changed();
  }, "quiet small danger-link");
  remove.setAttribute("aria-label", languageName[lang] + "版を外す");
  header.append(node("h4", languageName[lang]), select, remove);
  box.append(header, selected);
  parent.append(box);

  function render() {
    const current = slot.editions[lang]?.videoId;
    select.textContent = current ? "差し替え" : "作品を選ぶ";
    select.setAttribute("aria-label", languageName[lang] + (current ? "版を差し替え" : "の作品を選ぶ"));
    select.hidden = !editable;
    remove.hidden = !current;
    if (!current) {
      selected.replaceChildren(node("p", "掲載しない", "subtle"));
      return;
    }
    const item = placementVideoEdition(placement, entries, lang, current);
    selected.replaceChildren(placementVideoInfo(item));
    if (/^[A-Za-z0-9_-]{11}$/.test(current)) {
      const link = externalLink("https://www.youtube.com/watch?v=" + current, "YouTubeで確認 ↗");
      link.className = "text-link";
      selected.append(link);
    }
  }
  render();
}
function localPlacementPreview(placement, slots, entries) {
  const slides = {};
  for (const lang of ["ja", "en"]) {
    slides[lang] = slots.flatMap((slot) => {
      if (slot.kind === "image") {
        const image = placement.imageCandidates.find((item) => item.id === slot.imageId && item.eligible)?.images[lang];
        return image ? [{...slot, image}] : [];
      }
      const editions = {};
      for (const language of ["ja", "en"]) {
        const videoId = slot.editions[language]?.videoId;
        if (!videoId) continue;
        const entry = placementVideoEdition(placement, entries, language, videoId);
        editions[language] = {...entry, thumbnail: safeUrl(entry.thumbnail, true)};
      }
      return [{...slot, editions}];
    });
  }
  return {slides};
}
function describePlacementPreview(preview, result, environment, local = false) {
  preview.replaceChildren(node("h2", local ? "制作室での下書きプレビュー" : "テーマ画面での掲載プレビュー"));
  if (local) preview.append(node("p", "掲載先でプレビューを確認できないため、制作室の記録から選んだ作品と並びを表示しています。サイト上での再生や掲載可否は未確認です。", "subtle"));
  let playing = null;
  for (const lang of ["ja", "en"]) {
    preview.append(node("h3", languageName[lang]));
    const clips = result.slides?.[lang] || [];
    const row = node("div", null, "placement-preview");
    for (const slide of clips) {
      const box = node("article");
      if (slide.kind === "image") {
        const url = new URL(slide.image.src, environment.origin);
        if (url.origin === environment.origin) {
          const image = node("img");
          image.loading = "lazy"; image.alt = slide.image.alt; image.src = url.href;
          box.append(image);
        }
        box.append(node("p", slide.image.caption || slide.image.credit));
      } else {
        const actualLang = slide.editions[lang] ? lang : lang === "ja" ? "en" : "ja";
        const edition = slide.editions[actualLang];
        if (!edition) continue;
        if (local) box.append(placementVideoInfo({...edition, format: slide.format}));
        else {
          box.append(node("p", edition.title), node("small", slide.format === "short" ? "ショート" : "横長", "placement-preview-meta"));
          const play = publishingButton("プレイヤーを開く", () => {
            playing?.remove();
            const player = node("iframe");
            player.className = slide.format === "short" ? "placement-player vertical" : "placement-player";
            player.title = edition.title;
            player.referrerPolicy = "strict-origin-when-cross-origin";
            player.allowFullscreen = true;
            player.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(edition.videoId);
            playing = player;
            box.append(player);
          });
          box.append(play);
        }
        if (actualLang !== lang) box.append(node("small", languageName[actualLang] + "版を表示", "placement-preview-meta"));
        box.append(externalLink("https://www.youtube.com/watch?v=" + edition.videoId, "YouTubeで観る ↗"));
      }
      row.append(box);
    }
    preview.append(clips.length ? row : node("p", "表示できる素材はありません。", "subtle"));
  }
}
function buildPlacementEditor(editor, placement, environment, entries) {
  const original = JSON.stringify(placement.slots);
  const slots = structuredClone(placement.slots);
  const current = placement.latestRevision === placement.revision;
  const preview = node("section");
  const changes = node("div", null, "placement-slots");
  const forms = node("div", null, "placement-forms");
  editor.replaceChildren(node("h2", placement.title),
    node("p", placementEnvironmentLabel(environment.id) + " ・ 公開第" + placement.revision + "版", "overline"),
    changes, forms, preview);
  const previous = node("nav", null, "inline");
  editor.insertBefore(previous, changes);
  const versions = [...new Set([placement.latestRevision, ...(placement.previousPlacements || []).map((item) => item.revision)])]
    .filter((revision) => revision && revision !== placement.revision);
  for (const revision of versions) previous.append(publishingButton("第" + revision + "版の掲載を開く", async () => {
    if (JSON.stringify(slots) !== original && !window.confirm("この配置の編集中の変更を破棄しますか？")) return;
    const data = await api("/api/placement/theme?" + new URLSearchParams({
      environment:environment.id, themeId:placement.themeId, revision
    }));
    buildPlacementEditor(editor, data, environment, entries);
  }, "quiet small"));
  if (!current) {
    previous.append(node("small", "以前の公開版に登録された動画や画像を外せます。", "subtle"));
    forms.hidden = true;
  } else if (versions.length) {
    const last = Math.max(...versions);
    previous.append(publishingButton("第" + last + "版の配置を下書きに取り込む", async () => {
      const before = await api("/api/placement/theme?" + new URLSearchParams({
        environment:environment.id, themeId:placement.themeId, revision:last
      }));
      const targets = new Set(placement.targets.map(placementKey));
      const images = new Set(placement.imageCandidates.filter((image) => image.eligible && !image.coverOnly).map((image) => image.id));
      let skipped = 0;
      for (const slot of before.slots) {
        if (slots.some((entry) => entry.id === slot.id)) continue;
        const positions = slot.positions.filter((position) => targets.has(placementKey(position)));
        if (!positions.length || (slot.kind === "image" && !images.has(slot.imageId))) { skipped++; continue; }
        skipped += slot.positions.length - positions.length;
        slots.push({...slot, positions});
      }
      drawSlots(); refresh();
      notify("旧版の配置を下書きに反映しました。新しい公開版での見え方を確認して保存してください。"
        + (skipped ? " 新しい版で照合できなかった画像・位置 " + skipped + "件は候補に含めていません。" : ""));
    }, "quiet small"));
  }
  const changePayload = (action, requestId) => ({environment: environment.id, action, requestId,
    themeId: placement.themeId, revision: placement.revision, expectedGeneration: placement.generation, slots});
  const check = () => {
    if (slots.some((slot) => !slot.positions.length || (slot.kind === "video" && !Object.keys(slot.editions).length))) {
      throw new Error("すべての掲載枠に表示場所と画像または動画を選んでください。");
    }
  };
  let draftVersion = 0;
  const refresh = () => {
    draftVersion++;
    preview.replaceChildren();
    saveButton.disabled = JSON.stringify(slots) === original;
  };
  function drawSlots() {
    changes.replaceChildren();
    slots.forEach((slot, index) => {
      const article = node("article", null, "placement-slot");
      const head = node("div", null, "inline");
      const heading = node("h3");
      const updateTitle = () => { heading.textContent = (index + 1) + "　" + placementSlotTitle(slot, placement, entries); };
      updateTitle();
      head.append(heading);
      for (const [delta, label] of [[-1,"上へ"], [1,"下へ"]]) {
        const to = index + delta;
        const button = publishingButton(label, () => {
          [slots[index], slots[to]] = [slots[to], slots[index]]; drawSlots(); refresh();
        }, "quiet small");
        if (to < 0 || to >= slots.length) button.disabled = true;
        head.append(button);
      }
      head.append(publishingButton("外す", () => {
        slots.splice(index, 1); drawSlots(); refresh();
      }, "quiet small danger-link"));
      article.append(head);
      const imageCandidate = slot.kind === "image" ? placement.imageCandidates.find((item) => item.id === slot.imageId) : null;
      if (slot.kind === "video") {
        const profile = node("div", null, "placement-video-fields");
        article.append(profile);
        const format = publishSelect(article, "画面の向き", "format", [["landscape", "横長"], ["short", "ショート"]], slot.format);
        format.disabled = !current;
        format.onchange = () => { slot.format = format.value; refresh(); };
        const changed = () => { format.value = slot.format; updateTitle(); refresh(); };
        for (const lang of ["ja", "en"]) placementVideoField(profile, placement, lang, slot, entries, current, changed);
      } else {
        const image = imageCandidate?.images.ja || imageCandidate?.images.en;
        if (image?.credit) article.append(node("small", image.credit));
        if (imageCandidate?.coverOnly) article.append(node("small", "テーマ表紙の既存掲載", "subtle"));
      }
      const coverOnly = imageCandidate?.coverOnly === true;
      const savedPositions = coverOnly ? placement.slots.find((saved) => saved.id === slot.id)?.positions : null;
      const positions = node("details", null, "panel");
      positions.append(node("summary", "表示場所　" + slot.positions.length + "か所"));
      for (const {label, ...position} of placement.targets) {
        const key = placementKey(position);
        const checkbox = publishCheck(positions, position.kind === "theme" ? "テーマ画面の冒頭" : label, "position",
          slot.positions.some((value) => placementKey(value) === key));
        checkbox.disabled = (!current && !checkbox.checked) || (coverOnly && !savedPositions?.some((saved) => placementKey(saved) === key));
        checkbox.onchange = () => {
          slot.positions = slot.positions.filter((entry) => placementKey(entry) !== key);
          if (checkbox.checked) slot.positions.push(position);
          positions.querySelector("summary").textContent = "表示場所　" + slot.positions.length + "か所";
          refresh();
        };
      }
      article.append(positions); changes.append(article);
    });
    if (!slots.length) changes.append(node("p", "この公開版に掲載された素材はありません。", "subtle"));
  }
  const slideImages = placement.imageCandidates.filter((image) => !image.coverOnly);
  const selector = publishSelect(forms, "スライドに追加する画像（任意）", "image", [["", "画像を選ぶ"],
    ...slideImages.sort((left,right) => Number(right.origin === "licensed") - Number(left.origin === "licensed")).map((item) => [item.id, (item.images.ja?.alt || item.images.en?.alt || item.id) +
      (item.eligible ? "" : "（表示条件の確認が必要）")])]);
  for (const item of slideImages.filter((entry) => !entry.eligible)) {
    const row = [...selector.options].find((entry) => entry.value === item.id);
    if (row) row.disabled = true;
  }
  forms.append(publishingButton("画像を追加", () => {
    if (!selector.value) throw new Error("掲載する画像を選んでください。");
    slots.push({id:placementId(), kind:"image", imageId:selector.value, positions:[{kind:"theme"}]});
    drawSlots(); refresh();
  }), publishingButton("日英の動画枠を追加", () => {
    slots.push({id:placementId(), kind:"video", format:"landscape", editions:{}, positions:[{kind:"theme"}]});
    drawSlots(); refresh();
  }));
  const footer = node("div", null, "actions");
  editor.insertBefore(footer, preview);
  footer.append(publishingButton("掲載プレビュー", async () => {
    check();
    const version = draftVersion;
    try {
      const result = await api("/api/placement/theme", changePayload("preview", placementId()));
      if (version === draftVersion && preview.isConnected) describePlacementPreview(preview, result, environment);
    } catch (error) {
      if (error.code !== "VIDEO_VERIFICATION_UNAVAILABLE" && error.status !== 503) throw error;
      if (version === draftVersion && preview.isConnected) {
        describePlacementPreview(preview, localPlacementPreview(placement, slots, entries), environment, true);
      }
    }
  }));
  let lastRequest = {};
  const saveButton = publishingButton("この公開版に掲載を反映", async () => {
    check();
    const message = placementEnvironmentLabel(environment.id) + "の「" + placement.title + "」第" + placement.revision
      + "版にこの配置を反映しますか？ 限定公開の動画もテーマの訪問者が視聴できます。";
    if (!window.confirm(message)) return;
    const stateKey = JSON.stringify(slots);
    if (lastRequest.key !== stateKey) lastRequest = {key: stateKey, id: placementId()};
    const updated = await api("/api/placement/theme", changePayload("save", lastRequest.id));
    buildPlacementEditor(editor, updated, environment, entries);
    notify("公開テーマの掲載内容を更新しました。");
  }, "primary small");
  footer.append(saveButton);
  drawSlots(); refresh();
}
async function placementWorks(entries) {
  // An already running production keeps the previous server process until its render finishes.
  const needsDetail = entries.filter((item) => item.videoId && !placementVideoName(item));
  const ids = [...new Set(needsDetail.map((item) => item.caseId))];
  const details = new Map(await Promise.all(ids.map(async (id) =>
    [id, await api("/api/cases/" + encodeURIComponent(id)).catch(() => null)])));
  return entries.map((item) => {
    const detail = details.get(item.caseId);
    if (!detail || placementVideoName(item)) return item;
    const index = detail.runs.findIndex((run) => run.id === item.runId);
    const run = detail.runs[index];
    return {...item, title: run?.plan?.titles?.[item.lang] || detail.title, themeTitle:detail.themeTitle,
      themeId:detail.themeId, format:detail.shortSource ? "short" : "landscape",
      attempt:index < 0 ? null : detail.runs.length - index, thumbnail:run?.editions?.[item.lang]?.contactSheet};
  });
}
async function openPlacementDesk(version = state.routeVersion) {
  const [settings, works] = await Promise.all([
    api("/api/placement/settings"),
    api("/api/publication/status").then((delivery) => placementWorks(delivery.youtube)),
  ]);
  if (version !== state.routeVersion) return;
  const desk = $("placement-desk"), lookup = node("form", null, "placement-search");
  const results = node("div", null, "placement-results"), editor = node("div");
  desk.replaceChildren(lookup, results, editor);
  const environment = publishSelect(lookup, "掲載先", "environment",
    settings.environments.map((item) => [item.id, placementEnvironmentLabel(item.id) + " ・ " + new URL(item.origin).hostname]), "beta");
  const query = publishInput(lookup, "公開テーマ名", "query", placementTarget?.title || "", "search");
  query.maxLength = 200;
  const search = async () => {
    const sequence = ++placementVersion;
    const targetEnv = settings.environments.find((item) => item.id === environment.value);
    results.replaceChildren(); editor.replaceChildren();
    if (!targetEnv.configured) {
      results.append(node("p", "この環境の掲載用接続が未設定です。配備手順の掲載用トークンを設定してください。", "subtle"));
      return;
    }
    const found = await api("/api/placement/themes?" + new URLSearchParams({environment: targetEnv.id, q: trim(query.value)}));
    if (version !== state.routeVersion || sequence !== placementVersion) return;
    for (const theme of found.themes) {
      results.append(publishingButton(theme.title + " ・ 第" + theme.revision + "版", async () => {
        const read = ++placementVersion;
        const data = await api("/api/placement/theme?" + new URLSearchParams({environment:targetEnv.id, themeId:theme.id, revision:theme.revision}));
        if (version === state.routeVersion && read === placementVersion) buildPlacementEditor(editor, data, targetEnv, works);
      }));
    }
    if (!found.themes.length) results.append(node("p", "一致する公開テーマがありません。", "subtle"));
  };
  lookup.append(publishingButton("検索", search));
  lookup.onsubmit = (event) => { event.preventDefault(); search().catch((error) => notify(error.message, true)); };
  environment.onchange = () => search().catch((error) => notify(error.message, true));
  view("placements"); document.title = "テーマ掲載 | Plunode 映像制作室";
  await search();
}
