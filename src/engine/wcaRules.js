/**
 * wcaRules.js —— WCA 正规比赛规则核心（纯函数，可在 Node 中单测）
 *
 * 规则要点（依据 WCA 规则 4b/A6 等）：
 * - 观察时间 15 秒：15 秒内开始复原 = 正常；超 15 秒不超过 17 秒 = +2 秒；超 17 秒 = DNF
 * - 成绩格式："12.34" / "12.34+2"（已含罚时）/ "DNF"
 * - ao5 / ao12：去掉最好和最差后取平均；出现 2 次及以上 DNF 时平均为 DNF
 */

const INSPECTION_LIMIT_MS = 15000;
const INSPECTION_DNF_MS = 17000;
const PENALTY_MS = 2000;

// 观察阶段判定
function classifyInspection(elapsedMs) {
  if (elapsedMs <= INSPECTION_LIMIT_MS) return { penalty: '', call: '', level: 'ok' };
  if (elapsedMs <= INSPECTION_DNF_MS) return { penalty: '+2', call: '加两秒', level: 'plus2' };
  return { penalty: 'DNF', call: '成绩无效', level: 'dnf' };
}

// 观察期间的报时点（8 秒 / 12 秒）
function inspectionCalls(elapsedMs) {
  const calls = [];
  if (elapsedMs >= 8000 && elapsedMs < 12000) calls.push('八秒');
  if (elapsedMs >= 12000 && elapsedMs < INSPECTION_LIMIT_MS) calls.push('十二秒');
  return calls;
}

// 有效成绩（毫秒）；DNF → Infinity，方便排序取最差
function effectiveMs(ms, penalty) {
  if (penalty === 'DNF') return Infinity;
  return ms + (penalty === '+2' ? PENALTY_MS : 0);
}

// 时间格式化：12.34 / 1:23.45
function formatMs(ms) {
  if (ms == null || !isFinite(ms)) return 'DNF';
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  if (m > 0) return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  return s.toFixed(2);
}

// WCA 成绩展示：DNF / 12.34+2 / 12.34
function formatResult(ms, penalty) {
  if (penalty === 'DNF') return 'DNF';
  if (penalty === '+2') return formatMs((ms || 0) + PENALTY_MS) + '+2';
  return formatMs(ms);
}

/**
 * WCA 平均（ao5 / ao12）
 * @param {Array<{ms:number, penalty:string}>} results 恰好 n 次（不足返回 null）
 * @param {number} n 5 或 12
 * @returns {{ value: number|null, isDNF: boolean, dropped: {best:number, worst:number}|null }}
 */
function averageOf(results, n) {
  if (!results || results.length < n) return null;
  const eff = results.slice(0, n).map((r) => effectiveMs(r.ms, r.penalty));
  const dnfCount = eff.filter((v) => !isFinite(v)).length;
  if (dnfCount >= 2) return { value: null, isDNF: true, dropped: null };
  const sorted = eff.slice().sort((a, b) => a - b);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const mid = sorted.slice(1, n - 1);
  const avg = mid.reduce((a, b) => a + b, 0) / mid.length;
  return { value: Math.round(avg), isDNF: false, dropped: { best, worst } };
}

// 单次最好（忽略 DNF）
function bestOf(results) {
  const valid = results.map((r) => effectiveMs(r.ms, r.penalty)).filter((v) => isFinite(v));
  if (!valid.length) return null;
  return Math.min.apply(null, valid);
}

// 平均（mean，忽略 DNF；WCA 中 mean of 3 类似）
function meanOf(results) {
  const valid = results.map((r) => effectiveMs(r.ms, r.penalty)).filter((v) => isFinite(v));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

export { INSPECTION_LIMIT_MS, INSPECTION_DNF_MS, PENALTY_MS, classifyInspection, inspectionCalls, effectiveMs, formatMs, formatResult, averageOf, bestOf, meanOf };
