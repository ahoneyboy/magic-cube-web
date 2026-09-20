/**
 * scrambler.js —— WCA 风格打乱序列生成
 *
 * - 随机步打乱：3x3 默认 22 步（可 20-25），禁止同面连续与"同轴 ABA"（如 R L R）
 * - 随机状态打乱（random-state，更接近 WCA 标准）：生成随机可解状态，用求解器
 *   求其逆解作为打乱序列；求解器未就绪时自动回退随机步
 * - 可解性自校验：打乱完成后用块级模型验证（防死状态）
 *
 * 不依赖 wx / DOM，可在小程序与 Node 中通用。
 */



import { Cube, SOLVED } from './cube.js';
import * as c2 from './cube2.js';
import { getType } from './cubeTypes.js';
import { analyzeState, pieceArrays } from './cubies.js';
const AXIS_OF = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };

// 随机步打乱（random-state 的兜底）：WCA 标准 3x3 = 20 步、2x2 = 11 步（<U,R,F>）
// 禁同面连续、禁同轴 ABA（R L R）、同轴连续最多两步
function genRandomMoves(cubeType, length) {
  const type = getType(cubeType);
  if (type.id === '2x2') {
    const faces = ['U', 'R', 'F'];
    const out = [];
    let last = null;
    let last2 = null;
    while (out.length < (length || 11)) {
      const f = faces[Math.floor(Math.random() * 3)];
      if (f === last) continue;
      out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
      last2 = last;
      last = f;
    }
    return out;
  }
  const len = Math.max(15, Math.min(length == null ? 20 : length, 25));
  const out = [];
  let last = null;
  let last2 = null;
  while (out.length < len) {
    const f = ['U', 'R', 'F', 'D', 'L', 'B'][Math.floor(Math.random() * 6)];
    if (f === last) continue;
    // 同轴 ABA：R L R 这类模式跳过
    if (last2 && f === last2 && AXIS_OF[f] === AXIS_OF[last]) continue;
    out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
    last2 = last;
    last = f;
  }
  return out;
}

/**
 * 生成打乱序列
 * @param {string} cubeType      '3x3' | '2x2'
 * @param {Object} opts          { mode: 'random-move'|'random-state', length, solver }
 *   opts.solver: { randomStateScramble(type): Promise<string[]>|string[] } 由 solver.js 注入，
 *   保持本模块与求解器解耦。
 * @returns {Promise<{moves: string[], mode: string}>}
 */
function genScramble(cubeType, opts) {
  // 兼容旧签名 genScramble(22)
  if (typeof cubeType === 'number') {
    opts = { length: cubeType };
    cubeType = '3x3';
  }
  if (cubeType == null) cubeType = '3x3';
  opts = opts || {};
  const mode = opts.mode || 'random-move';
  if (mode === 'random-state' && opts.solver && typeof opts.solver.randomStateScramble === 'function') {
    return Promise.resolve()
      .then(() => opts.solver.randomStateScramble(cubeType))
      .then((moves) => {
        const list = Array.isArray(moves) ? moves : String(moves).trim().split(/\s+/).filter(Boolean);
        if (list.length && validateScramble(cubeType, list).ok) {
          return { moves: list, mode: 'random-state' };
        }
        return { moves: genRandomMoves(cubeType, opts.length), mode: 'random-move' };
      })
      .catch(() => ({ moves: genRandomMoves(cubeType, opts.length), mode: 'random-move' }));
  }
  return Promise.resolve({ moves: genRandomMoves(cubeType, opts.length), mode: 'random-move' });
}

// 校验打乱序列：非空、记号合法、应用后状态可解、未直接复原
function validateScramble(cubeType, moves) {
  const type = getType(cubeType);
  if (!Array.isArray(moves) || moves.length === 0) {
    return { ok: false, code: 'SCRAMBLE_EMPTY', message: '打乱序列为空' };
  }
  let state;
  try {
    type.parseSequence(moves);
    const cube = type.createCube(type.SOLVED);
    moves.forEach((m) => cube.move(m));
    state = cube.getFacelet();
  } catch (e) {
    return { ok: false, code: 'SCRAMBLE_BAD_MOVE', message: '打乱序列含非法记号：' + e.message };
  }
  if (state === type.SOLVED) {
    return { ok: false, code: 'SCRAMBLE_SOLVED', message: '打乱后仍是复原态' };
  }
  const check = type.analyzeState(state);
  if (!check.ok) {
    return { ok: false, code: 'SCRAMBLE_UNSOLVABLE', message: check.message };
  }
  return { ok: true, state };
}

export { genScramble, genRandomMoves, validateScramble };
