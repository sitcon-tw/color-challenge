"use strict";

const ROUND_DURATION = 30_000;

// A touch that turned into page navigation must not become a pick when the finger lifts.
function nextPickAction(action, dx, dy, released) {
  if (action === "drag" || action === "cancel") return action;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return released && action !== "grab" ? "pick" : action;
  if (action === "tap" || (action === "horizontal" && Math.abs(dy) >= Math.abs(dx))) return "cancel";
  return "drag";
}

class Round {
  constructor(mode, color, rotation = 0) {
    this.mode = mode;
    this.selection = { ...color };
    this.aim = { ...color };
    this.locked = new Set();
    this.startedAt = null;
    this.rotation = rotation;
    this.spinDegrees = 0;
  }

  spin() {
    if (this.spinDegrees || this.startedAt !== null) return 0;
    // Leave at least a sixth of a turn between the old and new positions.
    const degrees = 60 + Math.floor(Math.random() * 241);
    this.rotation = (this.rotation + degrees) % 360;
    this.spinDegrees = degrees;
    return degrees;
  }

  elapsed(now) {
    return this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
  }

  expired(now) {
    return this.mode === "timed" && this.elapsed(now) >= ROUND_DURATION;
  }

  pick(control, values, lock, now) {
    if (this.locked.has(control) || this.expired(now)) return false;
    const oneShot = this.mode === "oneshot";
    const locking = oneShot && lock;
    const changed = Object.entries(values).some(([key, value]) => Math.abs(this.aim[key] - value) > 1e-9);
    if (!changed && !locking) return false;

    this.startedAt ??= now;
    Object.assign(this.aim, values);
    if (!oneShot || locking) Object.assign(this.selection, values);
    if (locking) this.locked.add(control);
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

if (typeof module !== "undefined") module.exports = { Round, nextPickAction };
