"use strict";

const ROUND_DURATION = 30_000;

class Round {
  constructor(mode, color) {
    this.mode = mode;
    this.selection = { ...color };
    this.startedAt = null;
  }

  elapsed(now) {
    return this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
  }

  expired(now) {
    return this.mode === "timed" && this.elapsed(now) >= ROUND_DURATION;
  }

  pick(values, now) {
    if (this.expired(now)) return false;
    const changed = Object.entries(values).some(([key, value]) => Math.abs(this.selection[key] - value) > 1e-9);
    if (!changed) return false;

    this.startedAt ??= now;
    Object.assign(this.selection, values);
    return true;
  }

  resultTime(now) {
    if (this.expired(now)) return "時間到";
    if (this.startedAt === null) return "用時 0 秒";
    const ms = this.elapsed(now);
    if (ms < 100) return "用時不到 0.1 秒";
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.floor(ms % 60_000 / 100) / 10;
    return minutes ? `用時 ${minutes} 分 ${seconds} 秒` : `用時 ${seconds} 秒`;
  }
}

if (typeof module !== "undefined") module.exports = { Round };
