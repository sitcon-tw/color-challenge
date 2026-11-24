"use strict";

const CHALLENGE_URL = "https://sitcon.org/color-challenge/";
const shareOptions = byId("share-options");
const shareStatus = byId("share-status");
const shareText = byId("share-text");
const sharePreview = byId("share-preview");
const downloads = { story: byId("download-card"), post: byId("download-post") };
const cardHeights = { story: 1920, post: 1350 };
const modeOpeners = {
  oneshot: "我挑戰調出 SITCON 綠，色盤和明度各點一次",
  gyro: "我傾斜手機選色，挑戰調出 SITCON 綠",
};
const copyGameLink = byId("copy-game-link");
const openApp = byId("open-share-app");
let shareRound;

function prepareShare(round) {
  for (const card of Object.values(shareRound?.cards ?? {})) {
    if (card.url) URL.revokeObjectURL(card.url);
  }
  shareRound = round;
  const { mode, grade, displayed, score } = round;
  const exact = displayed === 0;
  round.gameUrl = CHALLENGE_URL;
  round.invitation = exact ? "你也能調到滿分嗎？" : "你能調得比我更像嗎？";
  round.colorNote = exact ? "" : describeColorDifference(round.differences);
  const points = exact ? "滿分 1000 分" : `${score} 分（滿分 1000）`;
  round.resultText = `${grade.verdict}，${points}。`;
  round.playDetails = round.spinLabel ? `${mode} · ${round.spinLabel}` : mode;
  round.distanceText = "RGB 距離 " + displayed.toFixed(1) + (exact ? "" : "（0 就是同色）");
  const opener = modeOpeners[round.kind] ?? "我看著標準色，用色盤挑戰調出 SITCON 綠";
  shareText.value = [
    `${opener}，拿到「${grade.name}」！`,
    round.resultText,
    round.playDetails,
    round.distanceText,
    round.invitation,
    round.gameUrl,
  ].join("\n");
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
  const { cards, playDetails, grade, resultText, distanceText, colorNote, gameUrl } = shareRound;
  sharePreview.height = cardHeights[format];
  sharePreview.alt = `調出 SITCON 綠${format === "story" ? "限動" : "貼文"}成績單。左邊的 SITCON Logo 是我的選色，右邊是標準綠。${colorNote}${resultText}稱號「${grade.name}」。${playDetails}。${distanceText}。挑戰網址 ${gameUrl}`;
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
  copyGameLink.hidden = false;
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
    const nextStep = round.cards.story.file ? "先選社群，再從系統選單選擇 App。" : "點選社群即可下載成績圖。";
    shareStatus.textContent = nextStep + "發限動可複製挑戰連結，貼到「連結」貼圖。";
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
      Instagram: "在 Instagram 新增限時動態，上傳直式成績圖，再用「連結」貼圖貼上挑戰網址。",
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
