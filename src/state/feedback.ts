// In-page feedback — stored in localStorage (the app is 100% static, no backend ever). The owner reads
// it via a hidden gesture (5 taps on the 诗云 logo within 10 s → FeedbackViewer). Capped at 5000 汉字
// total (oldest entries drop first).
//
// ⚠ NOTE for the deploy agent: localStorage is PER-BROWSER, so this only surfaces feedback typed on the
// SAME device the owner inspects. A truly shared inbox across visitors needs a serverless form endpoint
// (Formspree / Google Forms / a Cloudflare Worker) — out of scope for the static build; wire it at deploy
// if cross-device collection is wanted. `submitFeedback` is the single seam to repoint at such an endpoint.
const KEY = "shiyun_feedback_v1";
const MAX_HAN = 5000;
const HAN = /\p{Script=Han}/gu;
const hanCount = (s: string): number => (s.match(HAN) || []).length;

export interface Feedback {
  t: string; // the message
  ts: number; // epoch ms
}

export function getFeedback(): Feedback[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as Feedback[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Append a feedback message; trims oldest until the total is ≤ 5000 汉字. Returns false on empty input. */
export function submitFeedback(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  const list = getFeedback();
  list.push({ t: clean.slice(0, 5000), ts: Date.now() });
  let total = list.reduce((n, f) => n + hanCount(f.t), 0);
  while (total > MAX_HAN && list.length > 1) {
    const dropped = list.shift()!;
    total -= hanCount(dropped.t);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota — feedback just isn't persisted */
  }
  return true;
}

export function clearFeedback(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Total 汉字 currently stored (for the "x / 5000" indicator). */
export function feedbackHanTotal(): number {
  return getFeedback().reduce((n, f) => n + hanCount(f.t), 0);
}
