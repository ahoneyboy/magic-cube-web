/**
 * recordsMath.js —— 成绩/速度相关的纯函数（逻辑对照小程序 utils/records.js 移植）
 *
 * 速度语义（§5.1）：scrambleSec / demoSec 表示"每步总时长"（0.5~10s，步进 0.5s）；
 * 转动本身固定 500ms，其余时间为步间等待。
 */

// 速度用"每步秒数"表示：范围 0.5s ~ 10s，步进 0.5s（打乱与演示各自独立）
export const SPEED_MIN_SEC = 0.5;
export const SPEED_MAX_SEC = 10;
export const SPEED_STEP_SEC = 0.5;

// 转动动画固定时长（毫秒）；速度设置只决定这一步之后等多久再走下一步
export const TURN_MS = 500;
// 动画时长上限（旧实现 800ms 会把 0.5~10s 的速度设置截断；放宽到 12s）
export const DURATION_CAP_MS = 12000;

/** 对齐 0.5 步进并收敛到 [0.5, 10]（非法值回退 fallback） */
export function normalizeSec(v, fallback) {
  let n = Number(v);
  if (!isFinite(n)) n = fallback;
  n = Math.round(n / SPEED_STEP_SEC) * SPEED_STEP_SEC; // 对齐到 0.5 的整数倍
  if (n < SPEED_MIN_SEC) n = SPEED_MIN_SEC;
  if (n > SPEED_MAX_SEC) n = SPEED_MAX_SEC;
  return Math.round(n * 10) / 10; // 避免浮点毛刺（如 2.5000000001）
}

/** 每步总时长（秒）→ { turnMs, waitMs }：转动固定 500ms + 等待剩余 */
export function stepTimings(secPerStep) {
  const totalMs = Math.round(normalizeSec(secPerStep, SPEED_MIN_SEC) * 1000);
  return { turnMs: TURN_MS, waitMs: Math.max(0, totalMs - TURN_MS) };
}

/** 动画时长上限保护（与 cube3d 的 drain 一致） */
export function clampDuration(ms) {
  return Math.max(80, Math.min(ms || 250, DURATION_CAP_MS));
}

// ---- 段位（对照 records.js LEVELS）----
export const LEVELS = [
  { id: 'master', name: '高手', maxMs: 30 * 1000, icon: 'trophy' },
  { id: 'skilled', name: '熟练', maxMs: 60 * 1000, icon: 'target' },
  { id: 'advanced', name: '进阶', maxMs: 90 * 1000, icon: 'star' },
  { id: 'beginner', name: '入门', maxMs: 180 * 1000, icon: 'sprout' },
  { id: 'novice', name: '新手', maxMs: Infinity, icon: 'cube' }
];

export function computeLevel(avgMs) {
  if (!avgMs || avgMs <= 0) return LEVELS[LEVELS.length - 1];
  return LEVELS.find((l) => avgMs < l.maxMs) || LEVELS[LEVELS.length - 1];
}

/** 时间格式化：0.00 / 12.34 / 1:23.45（精确到 10ms） */
export function formatDuration(ms) {
  if (ms == null) return '--:--';
  const total = Math.round(ms / 10) / 100; // 精确到 10ms
  const m = Math.floor(total / 60);
  const s = (total % 60).toFixed(2);
  return (
    (m > 0 ? m + ':' : '') +
    (m > 0 ? String(Math.floor(total % 60)).padStart(2, '0') : parseFloat(s).toFixed(2))
  );
}

/** 日期键：YYYY-MM-DD（本地时区） */
export function todayKey(d) {
  const t = d || new Date();
  return (
    t.getFullYear() +
    '-' +
    String(t.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(t.getDate()).padStart(2, '0')
  );
}
