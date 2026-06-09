// One shared device-capability signal, evaluated ONCE at module load (before the Canvas mounts) so
// auto-quality, the dpr cap, the 行星 mobile gate, and the touch hover-skip all read the SAME truth and
// the galaxy is built at the right size on the first paint (no build-high-then-rebuild-low flash).
//
// Two exports:
//   COARSE — the pointer is coarse (a finger, not a mouse) → touch device. Gates the hover-pick path
//            (touch has no hover) + drives the responsive intent.
//   WEAK   — a weak / mobile GPU → default 画质·低 + cap dpr + block the 857k-point 行星 layer.
//
// Heuristic is privacy-safe (NOT WEBGL_debug_renderer_info — deprecated/spoofed/blocked in many
// browsers). It's a DEFAULT, never a hard lock: the user can always force 画质·高 via the HUD toggle.

export const COARSE =
  typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export function detectWeakGPU(): boolean {
  if (typeof navigator === "undefined") return false;
  // PRIMARY signal: a coarse primary pointer = a phone or tablet (finger, not a mouse). This is the
  // robust catch-all — it does NOT depend on the UA string (an iPad on iPadOS ≥13 sends a *Macintosh*
  // desktop UA, so a UA regex misses it) nor on a screen-size threshold (an 11"/12.9" iPad reports
  // 834/1024 CSS px, well over any "phone" bound). A touchscreen LAPTOP keeps a FINE primary pointer
  // (its trackpad/mouse), so COARSE is false there and it stays on the high preset. (matchMedia-backed.)
  if (COARSE) return true;
  // SECONDARY: a genuinely low-end DESKTOP (fine pointer). Require BOTH few cores AND low memory so a
  // privacy-clamped hardwareConcurrency (Tor / Firefox resistFingerprinting report 2 on capable
  // machines) doesn't false-downgrade; a truly tiny ≤2 GB machine downgrades on memory alone.
  // deviceMemory is Chromium-only (absent elsewhere → defaults to 8, so its absence never downgrades).
  const cores = navigator.hardwareConcurrency ?? 8;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  if (mem <= 2) return true;
  if (cores <= 2 && mem <= 4) return true;
  return false;
}

export const WEAK = detectWeakGPU();
