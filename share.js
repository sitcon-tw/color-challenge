"use strict";

const shareOptions = byId("share-options");
const shareStatus = byId("share-status");
const shareText = byId("share-text");
const sharePreview = byId("share-preview");
const downloads = { story: byId("download-card"), post: byId("download-post") };
const cardHeights = { story: 1920, post: 1350 };
const modeRules = {
  oneshot: "色盤和明度各點一次，按下就鎖定。",
};
const copyGameLink = byId("copy-game-link");
const openApp = byId("open-share-app");
let shareRound;

function prepareShare(round) {
  for (const card of Object.values(shareRound?.cards ?? {})) {
    if (card.url) URL.revokeObjectURL(card.url);
  }
  shareRound = round;
  const { mode, grade, displayed } = round;
  round.invitation = displayed === 0 ? "你也能調到距離 0 嗎？" : "你能比我更接近 SITCON 綠嗎？";
  round.colorNote = describeColorDifference(round.differences);
  round.rule = modeRules[round.kind] ?? "";
  const challenge = "我看著 SITCON 標準綠，挑戰用色盤調出同色。" + round.rule;
  const message = `${challenge}\n${grade.verdict}！${round.colorNote}\nRGB 距離 ${displayed}（0 是同色）· ${mode}\n本局稱號「${grade.name}」。${round.invitation}`;
  const { protocol, hostname, origin, pathname } = location;
  const local = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.startsWith("127.") || hostname === "[::1]";
  round.gameUrl = /^https?:$/.test(protocol) && !local ? origin + pathname : "";
  shareText.value = round.gameUrl ? message + "\n" + round.gameUrl : message;
}

function makeScoreImage({ rgb, grade, displayed, mode, invitation, colorNote, rule }, format, logo) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = cardHeights[format];
  const ctx = canvas.getContext("2d");
  const ink = "#202924";
  const paper = "#f5f6f0";
  const accent = "#ffdf79";
  const font = '"Inter", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';

  function rect(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
  }
  function label(text, x, baseline, size, weight, color, maxWidth = canvas.width - 144) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(text, x, baseline, maxWidth);
  }

  const story = format === "story";
  const top = story ? 210 : 0;
  const swatchTop = story ? 552 : 498;
  const scoreTop = swatchTop + 394;
  rect(0, 0, canvas.width, canvas.height, paper);
  ctx.translate(0, top);
  label("SITCON 學生計算機年會", 72, 109, 43, 650, ink);
  ctx.drawImage(logo, 804, 35, 196, 196 * 261.6 / 193.6);
  label("調出 SITCON 綠", 66, 259, 98, 800, ink, 700);
  label("看著右邊的 SITCON 標準綠，", 72, 355, 46, 550, ink);
  label(rule || "我只靠眼力，用色盤調出左邊的答案。", 72, 422, 46, 550, ink);

  const swatches = [[hexColor(rgb), "我調的顏色"], [hexColor(SITCON_GREEN), "SITCON 標準綠"]];
  swatches.forEach(([color, name], index) => {
    const x = 72 + index * 480;
    rect(x, swatchTop, 456, 338, "#aab3a6");
    rect(x + 2, swatchTop + 2, 452, 334, "white");
    rect(x + 12, swatchTop + 12, 432, 232, color);
    label(name, x + 24, swatchTop + 305, 39, 650, ink);
  });

  rect(0, scoreTop, canvas.width, canvas.height - top - scoreTop, ink);
  label(grade.verdict, 67, scoreTop + 110, 82, 800, accent);
  label(colorNote, 72, scoreTop + 177, 37, 550, "white");
  label(`本局稱號「${grade.name}」`, 72, scoreTop + 254, 35, 500, "#e0e7df", 445);
  ctx.textAlign = "right";
  label(`RGB 距離 ${displayed}`, 1008, scoreTop + 99, 41, 650, "white");
  label("0 就是同色", 1008, scoreTop + 163, 33, 500, "white");
  label(mode, 1008, scoreTop + 254, 33, 500, "#e0e7df", 470);
  ctx.textAlign = "left";
  rect(72, scoreTop + 291, 936, 2, "#65716a");
  label(invitation, 72, scoreTop + 386, 49, 650, "white");
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png");
  });
}

async function makeShareCards(round) {
  const logo = byId("official-logo");
  await logo.decode();
  const entries = await Promise.all(Object.keys(cardHeights).map(async format => {
    const blob = await makeScoreImage(round, format, logo);
    const name = `sitcon-color-challenge-${round.displayed}-${format}.png`;
    const file = typeof File === "function" ? new File([blob], name, { type: blob.type }) : null;
    const canShare = file && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] });
    return [format, { blob, name, file: canShare ? file : null }];
  }));
  return Object.fromEntries(entries);
}

function previewCard(format) {
  const { cards, mode, grade, displayed, colorNote, rule } = shareRound;
  sharePreview.height = cardHeights[format];
  sharePreview.alt = `${format === "story" ? "限動圖" : "貼文圖"}。對照右邊的 SITCON 標準綠，用色盤調出左邊的顏色。${rule}${grade.verdict}！${colorNote}RGB 距離 ${displayed}，${mode}，本局稱號「${grade.name}」。`;
  if (sharePreview.src !== cards[format].url) sharePreview.src = cards[format].url;
  sharePreview.hidden = false;
}

for (const [format, link] of Object.entries(downloads)) {
  link.addEventListener("click", () => previewCard(format));
}

byId("share-result").addEventListener("click", async () => {
  const round = shareRound;
  sharePreview.hidden = true;
  for (const link of Object.values(downloads)) link.hidden = true;
  copyGameLink.hidden = !round.gameUrl;
  openApp.hidden = true;
  shareOptions.disabled = true;
  byId("native-share").hidden = true;
  byId("share-caption").open = false;
  shareStatus.textContent = "正在產生成績圖⋯";
  byId("share-dialog").showModal();
  try {
    round.imagePromise ??= makeShareCards(round);
    round.cards = await round.imagePromise;
    if (round !== shareRound) return;
    for (const [format, card] of Object.entries(round.cards)) {
      card.url ??= URL.createObjectURL(card.blob);
      downloads[format].href = card.url;
      downloads[format].download = card.name;
      downloads[format].hidden = false;
    }
    previewCard("story");
    byId("native-share").hidden = !round.cards.post.file;
    shareStatus.textContent = round.cards.story.file
      ? "選好社群後，請在系統分享選單點選該 App。"
      : "選擇社群後會下載成績圖，再到該社群上傳。";
    shareOptions.disabled = false;
  } catch {
    if (round !== shareRound) return;
    round.imagePromise = null;
    shareStatus.textContent = "成績圖產生失敗，請關閉後再開啟分享。";
  }
});

shareOptions.addEventListener("click", async event => {
  const button = event.target.closest("button[data-app]");
  if (!button || shareOptions.disabled) return;
  const app = button.dataset.app;
  const round = shareRound;
  const format = app === "Instagram" ? "story" : "post";
  const card = round.cards[format];
  previewCard(format);
  openApp.hidden = !app;
  if (app) {
    const url = new URL(button.dataset.url);
    if (app === "Threads") url.searchParams.set("text", shareText.value);
    openApp.href = url.href;
    openApp.textContent = "開啟 " + app;
  }
  if (!card.file) {
    downloads[format].click();
    const instructions = {
      Instagram: "在 Instagram App 新增限時動態，選取下載的直式成績圖。",
      LINE: "開啟 LINE 聊天室，選取下載的成績圖傳送。",
      Threads: "開啟 Threads 發文，加入下載的成績圖。",
    };
    shareStatus.textContent = instructions[app];
    return;
  }
  const payload = { files: [card.file] };
  shareStatus.textContent = app ? `請在系統分享選單選擇 ${app}。` : "請在系統選單選擇要接收成績圖的 App。";
  try {
    if (app !== "Instagram" && navigator.canShare({ ...payload, text: shareText.value })) payload.text = shareText.value;
    await navigator.share(payload);
  } catch (error) {
    if (round !== shareRound) return;
    shareStatus.textContent = error.name === "AbortError"
      ? "可以重新分享，或下載成績圖後自行上傳。"
      : "系統分享無法開啟，請下載成績圖後上傳。";
  }
});

async function copyShareText(linkOnly = false) {
  const text = linkOnly ? shareRound.gameUrl : shareText.value;
  try {
    await navigator.clipboard.writeText(text);
    shareStatus.textContent = linkOnly ? "已複製挑戰連結，可以貼到限時動態的「連結」貼圖。" : "已複製成績，可以貼到社群。";
  } catch {
    byId("share-caption").open = true;
    shareText.focus();
    shareText.setSelectionRange(shareText.value.length - text.length, shareText.value.length);
    shareStatus.textContent = "已選取文字，請使用裝置的複製功能。";
  }
}
copyGameLink.addEventListener("click", () => copyShareText(true));
if ("CommandEvent" in window && "commandForElement" in HTMLButtonElement.prototype) {
  shareText.addEventListener("command", event => {
    if (event.command === "--copy") copyShareText();
  });
} else {
  byId("copy-result").addEventListener("click", () => copyShareText());
}
