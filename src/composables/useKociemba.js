/**
 * useKociemba.js —— Kociemba Worker 客户端（§5.2）
 *
 * 协议：postMessage({ type:'solve'|'scramble'|'init', ... })，深度 22。
 * Worker 不可用 / 超时：solve 回退层先法；scramble 回退随机步（WCA 标准 20 步）。
 */
import KociembaWorker from '../workers/kociemba.worker.js?worker';
import { solveLbl } from '../engine/lblSolver.js';
import { genRandomMoves, validateScramble } from '../engine/scrambler.js';

const state = {
  worker: null,
  failed: false,
  failedReason: '',
  ready: false,
  readyListeners: [],
  pending: {},
  seq: 1
};

/** 调试/状态展示：求解器后端状态 */
export function kociembaStatus() {
  return { ready: state.ready, failed: state.failed, failedReason: state.failedReason, hasWorker: !!state.worker };
}

function ensureWorker() {
  if (state.failed) return null;
  if (state.worker) return state.worker;
  try {
    state.worker = new KociembaWorker();
    state.worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'ready') {
        state.ready = true;
        state.readyListeners.splice(0).forEach((cb) => {
          try {
            cb();
          } catch (err) {
            /* 忽略 */
          }
        });
        return;
      }
      const pending = msg.id ? state.pending[msg.id] : null;
      if (!pending) return;
      clearTimeout(pending.timer);
      delete state.pending[msg.id];
      if (msg.type === 'solved') pending.resolve({ type: 'solved', solution: msg.solution });
      else if (msg.type === 'scrambled') pending.resolve({ type: 'scrambled', scramble: msg.scramble });
      else if (msg.type === 'advanced') pending.resolve({ type: 'advanced', result: msg.result });
      else if (msg.type === 'lbl') pending.resolve({ type: 'lbl', result: msg.result });
      else pending.reject({ code: msg.code || 'WORKER_FAIL', message: msg.message || 'Worker 求解失败' });
    };
    state.worker.onerror = (e) => {
      state.failed = true;
      state.failedReason = (e && e.message) || 'worker onerror';
      state.worker = null;
      failAllPending('Worker 加载失败');
    };
    state.worker.postMessage({ type: 'init' });
    return state.worker;
  } catch (e) {
    state.failed = true;
    state.worker = null;
    return null;
  }
}

function failAllPending(message) {
  Object.keys(state.pending).forEach((id) => {
    const p = state.pending[id];
    clearTimeout(p.timer);
    p.reject({ code: 'WORKER_FAIL', message });
  });
  state.pending = {};
}

function workerRequest(payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = ensureWorker();
    if (!worker) {
      reject({ code: 'WORKER_FAIL', message: 'Worker 不可用' });
      return;
    }
    const id = String(state.seq++);
    const timer = setTimeout(() => {
      delete state.pending[id];
      state.failedReason = 'timeout';
      reject({ code: 'TIMEOUT', message: '求解超时' });
    }, timeoutMs || 15000);
    state.pending[id] = { resolve, reject, timer };
    payload.id = id;
    worker.postMessage(payload);
  });
}

/** 预热（幂等）：应用启动后调用一次 */
export function warmupKociemba() {
  ensureWorker();
}

export function isKociembaReady() {
  return state.ready;
}

export function onKociembaReady(cb) {
  if (state.ready) cb();
  else state.readyListeners.push(cb);
}

/**
 * 最优解（Kociemba ≤22 步；Worker 不可用回退层先法）
 * @returns {Promise<{ moves: string[], backend: 'kociemba'|'lbl' }>}
 */
export async function solveOptimal(facelet, { timeout = 15000 } = {}) {
  try {
    const res = await workerRequest({ type: 'solve', facelet }, timeout);
    const moves = String(res.solution).trim().split(/\s+/).filter(Boolean);
    return { moves, backend: 'kociemba' };
  } catch (e) {
    const r = solveLbl(facelet);
    return { moves: r.moves, backend: 'lbl' };
  }
}

/**
 * random-state 打乱：Worker 内随机状态多次求解取 ≤20 最短；失败回退随机步。
 * @returns {Promise<{ moves: string[], mode: 'random-state'|'random-move' }>}
 */
export async function randomStateScramble3x3() {
  try {
    const res = await workerRequest({ type: 'scramble' }, 20000);
    const moves = String(res.scramble).trim().split(/\s+/).filter(Boolean);
    const check = validateScramble('3x3', moves);
    if (moves.length && check.ok) return { moves, mode: 'random-state' };
  } catch (e) {
    /* 回退 */
  }
  return { moves: genRandomMoves('3x3', 20), mode: 'random-move' };
}

/**
 * 高级解法（Roux/ZZ/Petrus/盲拧）：Worker 优先（不卡界面），失败回退主线程。
 * @returns {Promise<{ moves, stages, solved, memo?, fallback }>}
 */
export async function solveAdvancedViaWorker(facelet, method, { budgetMs } = {}) {
  const budget = budgetMs || (method === 'blind' ? 3500 : 5000);
  const P = await import('../engine/pieceSolver.js');
  const ADV = await import('../engine/advancedMethods.js');
  try {
    const res = await workerRequest({ type: 'solveAdvanced', facelet, method, budgetMs: budget }, budget + 8000);
    if (res.result) return res.result;
    throw new Error('Worker 未返回结果');
  } catch (e) {
    // 主线程兜底（让出一次事件循环，保持点击反馈）
    await new Promise((r) => setTimeout(r, 20));
    P.setBudget(budget);
    try {
      return ADV.solveAdvanced(facelet, method);
    } finally {
      P.clearBudget();
    }
  }
}
