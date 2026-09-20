/**
 * kociemba.worker.js —— Kociemba 最优解 Worker（§5.2 协议）
 *
 * postMessage({ type: 'init' })                     → 初始化求解表，回 { type:'ready' }
 * postMessage({ type:'solve', id, facelet })        → 深度 22 求解，回 { type:'solved', id, solution }
 * postMessage({ type:'scramble', id })              → 随机状态多次求解取 ≤20 最短（WCA 惯例：随机状态取逆）
 * postMessage({ type:'solveAdvanced', id, method, facelet, budgetMs }) → 高级解法（Roux/ZZ/Petrus/盲拧）
 */
import Cube from 'cubejs';
import { solveAdvanced } from '../engine/advancedMethods.js';
import * as P from '../engine/pieceSolver.js';
import { solveLbl } from '../engine/lblSolver.js';

let ready = false;

function toMoves(solution) {
  return String(solution).trim().split(/\s+/).filter(Boolean);
}

/** 随机可解状态 → 求解取逆 = WCA 风格打乱；多次求解取最短（≤20 优先，不硬性拦截） */
function randomStateScramble() {
  let best = null;
  for (let i = 0; i < 6; i++) {
    const c = Cube.random();
    const sol = c.solve(22);
    const moves = toMoves(sol);
    // 取逆（WCA 惯例：打乱公式 = 随机状态的解的逆）
    const inverse = moves
      .slice()
      .reverse()
      .map((m) => (m.length === 2 ? (m[1] === '2' ? m : m[0]) : m + "'"));
    if (inverse.length && (best == null || inverse.length < best.length)) {
      best = inverse;
    }
    if (best && best.length <= 20) break; // 已达到 WCA 惯例长度
  }
  return best;
}

self.onmessage = (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      if (!ready) {
        Cube.initSolver();
        ready = true;
      }
      self.postMessage({ type: 'ready' });
      return;
    }
    if (msg.type === 'solve') {
      if (!ready) {
        Cube.initSolver();
        ready = true;
      }
      const solution = Cube.fromString(msg.facelet).solve(22);
      self.postMessage({ type: 'solved', id: msg.id, solution });
      return;
    }
    if (msg.type === 'scramble') {
      if (!ready) {
        Cube.initSolver();
        ready = true;
      }
      const scramble = randomStateScramble();
      if (scramble) {
        self.postMessage({ type: 'scrambled', id: msg.id, scramble: scramble.join(' ') });
      } else {
        self.postMessage({ type: 'scrambleFail', id: msg.id, message: 'Kociemba 未找到 ≤20 步打乱' });
      }
      return;
    }
    if (msg.type === 'solveAdvanced') {
      P.setBudget(msg.budgetMs || 5000);
      let result;
      try {
        result = solveAdvanced(msg.facelet, msg.method);
      } finally {
        P.clearBudget();
      }
      // explain 由主线程生成（避免 worker 内再载一份文案表）
      self.postMessage({ type: 'advanced', id: msg.id, result });
      return;
    }
    if (msg.type === 'solveLbl') {
      const r = solveLbl(msg.facelet);
      self.postMessage({ type: 'lbl', id: msg.id, result: r });
      return;
    }
    self.postMessage({ type: 'error', id: msg.id, message: '未知消息类型：' + msg.type });
  } catch (err) {
    self.postMessage({
      type: msg.type === 'solveAdvanced' ? 'advancedError' : 'error',
      id: msg.id,
      code: (err && err.code) || 'WORKER_FAIL',
      message: String((err && err.message) || err)
    });
  }
};
