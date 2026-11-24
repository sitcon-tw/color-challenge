"use strict";

async function followTilt(signal, currentRound, onPick, onStatus) {
  const orientation = window.DeviceOrientationEvent;
  if (typeof orientation.requestPermission === "function") {
    onStatus("permission");
    try {
      const permission = await orientation.requestPermission();
      if (signal.aborted) return;
      if (permission !== "granted") return onStatus("denied");
    } catch {
      if (!signal.aborted) onStatus("denied");
      return;
    }
  }

  let origin = null;
  onStatus("waiting");
  const timeout = setTimeout(() => onStatus("missing"), 4000);
  signal.addEventListener("abort", () => clearTimeout(timeout), { once: true });
  document.addEventListener("visibilitychange", () => { origin = null; }, { signal });
  window.addEventListener("deviceorientation", ({ alpha, beta, gamma }) => {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const round = currentRound();
    if (!round || document.hidden) {
      origin = null;
      return;
    }
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    // Device orientation uses intrinsic Z-X-Y rotations. Compare the screen normal in the calibrated frame.
    const heading = Number.isFinite(alpha) ? alpha : 0;
    const pose = new DOMMatrix().rotateSelf(0, 0, heading).rotateSelf(beta, 0, 0).rotateSelf(0, gamma, 0);
    if (!origin || origin.angle !== angle || origin.rotation !== round.rotation) {
      origin = { inverse: pose.rotate(0, 0, -angle).inverse(), angle, rotation: round.rotation, color: { ...round.selection } };
      clearTimeout(timeout);
      onStatus("active");
      return;
    }
    const relative = origin.inverse.multiply(pose);
    onPick(colorAfterTilt(origin.color, relative.m31, -relative.m32, origin.rotation));
  }, { signal });
}
