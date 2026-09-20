/**
 * blindSolver.js —— 盲拧（三循环法，彳亍法同源思路）
 *
 * 组成：
 *   1) 字母编码：Speffz 风格字母表（角缓冲 ULB=A、棱缓冲 UB=A）
 *      把"哪张贴纸该去哪"串成字母串/字母对，就是盲拧要背的记忆内容
 *      （彳亍法、M2R2、四步法都基于同一套编码）
 *   2) 求解：纯三循环公式（棱 Ua/Ub、角 Aa/Ab）+ 计算机搜索的 setup，
 *      每次把一块送回家且不破坏已完成部分；最后用 T 型公式做奇偶修正。
 *
 * 不依赖 wx / DOM，可在 Node 中通用。
 */


import { PLL } from './config/algLibrary.js';
import { Cube, QUARTER, QUARTER_SLICE, QUARTER_WIDE, SOLVED, invertSequence } from './cube.js';
import { CORNERS, EDGES } from './cubies.js';
import * as lbl from './lblSolver.js';
import * as P from './pieceSolver.js';
const PERM_ALL = Object.assign({}, QUARTER, QUARTER_SLICE, QUARTER_WIDE);

// ---- 字母表（"槽位下标:贴纸颜色" → 字母）----
const CORNER_LETTERS = {
  '2:U': 'A', '6:U': 'B', '7:U': 'C', '3:U': 'D',
  '2:L': 'E', '3:L': 'F', '3:F': 'G', '7:F': 'H',
  '7:R': 'I', '6:R': 'J', '6:B': 'K', '2:B': 'L',
  '0:D': 'M', '4:D': 'N', '5:D': 'O', '1:D': 'P',
  '1:L': 'Q', '0:L': 'R', '1:F': 'S', '5:F': 'T',
  '5:R': 'U', '4:R': 'V', '4:B': 'W', '0:B': 'X'
};
const EDGE_LETTERS = {
  '2:U': 'A', '11:U': 'B', '3:U': 'C', '9:U': 'D',
  '9:L': 'E', '5:L': 'F', '3:F': 'G', '7:F': 'H',
  '11:R': 'I', '6:R': 'J', '2:B': 'K', '4:B': 'L',
  '0:D': 'M', '10:D': 'N', '1:D': 'O', '8:D': 'P',
  '8:L': 'Q', '4:L': 'R', '5:F': 'S', '1:F': 'T',
  '10:R': 'U', '7:R': 'V', '0:B': 'W', '6:B': 'X'
};
const BUFFER_CORNER = 2; // ULB
const BUFFER_EDGE = 2; // UB

// 贴纸（facelet 下标）→ 字母
const LETTER_OF_FACELET = {};
(function buildFacelerMaps() {
  [[CORNERS, CORNER_LETTERS], [EDGES, EDGE_LETTERS]].forEach(([SLOTS, MAP]) => {
    SLOTS.forEach((slot, si) => {
      slot.facelets.forEach((f, j) => {
        const letter = MAP[si + ':' + slot.solvedColors[j]];
        if (letter) LETTER_OF_FACELET[f] = letter;
      });
    });
  });
})();

// ---- 基础工具 ----
function slotOfFacelet(idx, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  for (let i = 0; i < SLOTS.length; i++) {
    if (SLOTS[i].facelets.indexOf(idx) >= 0) return i;
  }
  return -1;
}
function pieceAt(facelet, slot, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const s = SLOTS[slot];
  const key = s.facelets
    .map((f) => facelet[f])
    .sort()
    .join('');
  for (let i = 0; i < SLOTS.length; i++) {
    if (SLOTS[i].solvedColors.slice().sort().join('') === key) return i;
  }
  return -1;
}
function isHomeOriented(facelet, slot, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const s = SLOTS[slot];
  for (let j = 0; j < s.facelets.length; j++) {
    if (facelet[s.facelets[j]] !== s.solvedColors[j]) return false;
  }
  return true;
}
// 某块"家里"对应颜色的贴纸下标
function homeFaceletOf(slot, color, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const s = SLOTS[slot];
  for (let j = 0; j < s.facelets.length; j++) {
    if (s.solvedColors[j] === color) return s.facelets[j];
  }
  return -1;
}

// ---- 编码（记忆内容）----
/**
 * @returns { edge:{letters,pairs,cycles}, corner:{...}, parity, summary }
 */
function permHasSwapOrOdd(facelet, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const n = SLOTS.length;
  const perm = [];
  for (let i = 0; i < n; i++) perm.push(pieceAt(facelet, i, isCorner));
  let visited = new Array(n).fill(false);
  let transpositions = 0;
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    let len = 0;
    let j = i;
    while (!visited[j]) {
      visited[j] = true;
      j = perm[j];
      len++;
    }
    if (len === 2) return true; // 存在两块互换（3 循环解决不了）
    transpositions += len - 1;
  }
  return transpositions % 2 === 1;
}

function computeMemo(facelet) {
  const edge = traceType(facelet, false);
  const corner = traceType(facelet, true);
  const parityNeeded = permHasSwapOrOdd(facelet, false) || permHasSwapOrOdd(facelet, true);
  return {
    edge,
    corner,
    parity: parityNeeded,
    summary:
      (edge.letters.length ? '棱 ' + edge.letters.join('') : '棱 已归位') +
      ' ｜ ' +
      (corner.letters.length ? '角 ' + corner.letters.join('') : '角 已归位')
  };
}

function traceType(facelet, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const MAP = isCorner ? CORNER_LETTERS : EDGE_LETTERS;
  const buffer = isCorner ? BUFFER_CORNER : BUFFER_EDGE;
  const total = SLOTS.length;
  const letters = [];
  const cycles = [];
  const bufferSticker = SLOTS[buffer].facelets[0];
  // 已纳入编码的"块"（按块去重，避免同一批块被反复换循环遍历）
  const covered = new Set();
  // 原位扭转/翻转的块（位置对、朝向不对）：3 循环解决不了，单独交给收尾阶段，
  // 也不参与字母循环（否则会被当成"自环"重复计入，字母数虚高）
  const twisted = new Set();
  for (let i = 0; i < total; i++) {
    if (pieceAt(facelet, i, isCorner) === i && !isHomeOriented(facelet, i, isCorner)) twisted.add(i);
  }

  const unsolvedSticker = () => {
    for (let i = 0; i < total; i++) {
      if (covered.has(i) || twisted.has(i) || isHomeOriented(facelet, i, isCorner)) continue;
      // 该槽位里"放错位置"的那张贴纸
      const s = SLOTS[i];
      const piece = pieceAt(facelet, i, isCorner);
      if (piece === i) {
        // 块在家但朝向不对：从任意贴纸起头
        return s.facelets[0];
      }
      for (let j = 0; j < s.facelets.length; j++) {
        if (facelet[s.facelets[j]] !== s.solvedColors[j]) return s.facelets[j];
      }
      return s.facelets[0];
    }
    return -1;
  };

  for (let guard = 0; guard < 16; guard++) {
    let start;
    if (!isHomeOriented(facelet, buffer, isCorner) && !covered.has(buffer)) {
      start = bufferSticker;
    } else {
      start = unsolvedSticker();
      if (start < 0) break;
    }
    const cycle = [];
    const touched = new Set();
    let i = start;
    let closed = false;
    const startSlot = slotOfFacelet(start, isCorner);
    for (let step = 0; step < 24; step++) {
      const color = facelet[i];
      const slot = slotOfFacelet(i, isCorner);
      if (slot < 0) break;
      const piece = pieceAt(facelet, slot, isCorner);
      if (piece < 0) break;
      touched.add(slot);
      touched.add(piece);
      const dest = homeFaceletOf(piece, color, isCorner);
      if (dest < 0) break;
      // 走到"原位扭转"的块：循环到此为止（该块由收尾阶段处理）
      const destSlot = slotOfFacelet(dest, isCorner);
      if (twisted.has(destSlot)) {
        closed = true;
        break;
      }
      const letter = MAP[piece + ':' + color];
      if (letter == null) break;
      letters.push(letter);
      cycle.push(letter);
      // 闭环判定按"槽位"：链回到起始槽位即循环完成
      // （同一槽位的两张贴纸可能不同，按贴纸判定会多绕一圈、字母数虚高）
      if (destSlot === startSlot) {
        closed = true;
        // 缓冲环收尾时"回到缓冲块"的那一步不写字母（彳亍法惯例）；
        // 换循环（从其它块起头）则最后一个字母也要写
        if (startSlot === buffer) {
          letters.pop();
          cycle.pop();
        }
        break;
      }
      i = dest;
    }
    touched.forEach((x) => covered.add(x));
    if (cycle.length) cycles.push(cycle);
    if (!closed) break;
  }
  return { letters, pairs: pairUp(letters), cycles, twisted: Array.from(twisted) };
}
function pairUp(letters) {
  const out = [];
  for (let i = 0; i < letters.length; i += 2) {
    out.push(letters.slice(i, i + 2).join(''));
  }
  return out;
}

// ---- 三循环公式与环结构 ----
function cycleOfAlg(alg, isCorner) {
  const c = new Cube(SOLVED);
  alg.forEach((m) => c.move(m));
  const st = c.getFacelet();
  if (st === SOLVED) return null;
  const SLOTS = isCorner ? CORNERS : EDGES;
  const perm = [];
  for (let i = 0; i < SLOTS.length; i++) perm.push(pieceAt(st, i, isCorner));
  const moved = [];
  for (let i = 0; i < SLOTS.length; i++) if (perm[i] !== i) moved.push(i);
  if (moved.length !== 3) return null;
  const next = {};
  for (const y of moved) next[perm[y]] = y;
  const p1 = moved[0];
  const p2 = next[p1];
  const p3 = next[p2];
  if (next[p3] !== p1) return null;
  return [p1, p2, p3];
}

const algById = (id) => PLL.find((a) => a.id === id).moves;
const UA = algById('pll-ua');
const UB = algById('pll-ub');
const AA = algById('pll-aa');
const AB = algById('pll-ab');
const T_PERM = algById('pll-t');
const JB = algById('pll-jb');

const EDGE_ALGS = [UA, UB].map((moves) => ({ moves, cyc: cycleOfAlg(moves, false), inv: invertSequence(moves) }));
const CORNER_ALGS = [AA, AB].map((moves) => ({ moves, cyc: cycleOfAlg(moves, true), inv: invertSequence(moves) }));

// ---- setup 搜索 ----
function applyMoveToWhere(where, m) {
  const perm = PERM_ALL[m[0]];
  const times = m.length === 1 ? 1 : m[1] === '2' ? 2 : 3;
  for (let t = 0; t < times; t++) {
    for (let i = 0; i < where.length; i++) where[i] = perm[where[i]];
  }
}
/**
 * 搜索 setup 序列 S，使位置映射满足：槽位 from1 的贴纸落到 to1、from2 落到 to2
 * （用槽位代表贴纸追踪；由浅到深收集，最多 limit 条）
 * 位置约束只是必要条件，朝向是否合适由调用方逐个试探验证。
 */
function findSetups(from1, to1, from2, to2, maxDepth, isCorner, limit) {
  const cap = limit || 24;
  const SLOTS = isCorner ? CORNERS : EDGES;
  const from1F = SLOTS[from1].facelets;
  const to1Set = new Set(SLOTS[to1].facelets);
  const from2F = SLOTS[from2].facelets;
  const to2Set = new Set(SLOTS[to2].facelets);
  const where = new Array(54);
  for (let i = 0; i < 54; i++) where[i] = i;
  const path = [];
  const out = [];
  // 位置约束：from 槽位的两张贴纸都必须落在 to 槽位的两张贴纸之内（朝向由调用方试）
  const arrives = () =>
    to1Set.has(where[from1F[0]]) &&
    to1Set.has(where[from1F[1]]) &&
    to2Set.has(where[from2F[0]]) &&
    to2Set.has(where[from2F[1]]);
  const go = (depth, limitD) => {
    if (out.length >= cap) return;
    if (arrives()) {
      out.push(path.slice());
      return;
    }
    if (depth === limitD) return;
    for (const m of P.ALL_MOVES) {
      const snap = where.slice();
      applyMoveToWhere(where, m);
      path.push(m);
      go(depth + 1, limitD);
      path.pop();
      for (let i = 0; i < 54; i++) where[i] = snap[i];
      if (out.length >= cap) return;
    }
  };
  for (let d = 0; d <= maxDepth && out.length < cap; d++) {
    go(0, d);
  }
  return out;
}

// ---- 主流程 ----
function solveBlind(facelet) {
  const s = new P.PSession(facelet);
  const stages = [];
  const begin = (id, title, hint, emoji) => {
    stages.push({ id, title, hint, emoji, from: s.moves.length, moves: [] });
  };
  const end = () => {
    const cur = stages[stages.length - 1];
    cur.moves = s.moves.slice(cur.from);
  };
  const memo = computeMemo(facelet);

  begin('blind-edges', '棱块三循环（缓冲 UB）', '按字母串逐块送回家：纯棱三循环 + 计算机搜索 setup', '🔤');
  const edgeRes = solveType(s, false);
  if (edgeRes === 'failed') {
    // 极少数情况三循环推进不动：不中断，交给最后的收尾阶段（会用通用手法补齐）
    stages[stages.length - 1].hint = '三循环推进受阻，剩余部分改由收尾阶段完成';
  }
  end();

  begin('blind-corners', '角块三循环（缓冲 ULB）', '角块同样逐块归位：纯角三循环 + setup', '🔠');
  const cornerRes = solveType(s, true);
  if (cornerRes === 'failed') {
    stages[stages.length - 1].hint = '三循环推进受阻，剩余部分改由收尾阶段完成';
  }
  end();

  if (s.st !== SOLVED) {
    begin('blind-parity', '奇偶修正 / 收尾', '最后剩"两角两棱"交换或翻转时，逐块收掉', '♻️');
    if (!endgame(s)) throwBlind('奇偶修正失败');
    end();
  }

  return { moves: s.moves, stages, memo, solved: s.st === SOLVED };
}

function solveType(s, isCorner) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const total = SLOTS.length;
  const buffer = isCorner ? BUFFER_CORNER : BUFFER_EDGE;
  const solvedAt = (st, i) => (isCorner ? P.cornerSolvedAt(st, i) : P.edgeSolvedAt(st, i));
  const countSolved = (st) => {
    let n = 0;
    for (let i = 0; i < total; i++) if (solvedAt(st, i)) n++;
    return n;
  };
  const allSolved = (st) => countSolved(st) === total;
  const algs = isCorner ? CORNER_ALGS : EDGE_ALGS;

  for (let guard = 0; guard < 40; guard++) {
    P.checkBudget();
    if (allSolved(s.st)) return 'done';
    const wasSolved = [];
    for (let i = 0; i < total; i++) wasSolved.push(solvedAt(s.st, i));
    const baseCount = wasSolved.filter(Boolean).length;
    const othersOk = (st) => {
      for (let i = 0; i < total; i++) {
        if (wasSolved[i] && !solvedAt(st, i)) return false;
      }
      return true;
    };
    const curPiece = pieceAt(s.st, buffer, isCorner);
    if (curPiece < 0) return 'failed';

    if (curPiece === buffer) {
      if (!cycleBreak(s, isCorner, algs, solvedAt, wasSolved, countSolved)) {
        // 缓冲块已归位且只剩"两块互换"：奇偶情形，交给奇偶修正阶段
        return total - baseCount <= 2 ? 'parity' : 'failed';
      }
      continue;
    }
    // 把缓冲位的块送回它的家
    const home = curPiece;
    let progressed = false;
    for (const alg of algs) {
      if (!alg.cyc) continue;
      const [p1, p2, p3] = alg.cyc;
      const rots = [
        [p1, p2, p3, p1],
        [p2, p3, p1, p2],
        [p3, p1, p2, p3]
      ];
      for (const rot of rots) {
        const x = rot[0];
        const y = rot[1];
        let setups = findSetups(buffer, x, home, y, 3, isCorner, 14);
        let deep = false;
        for (let ci = 0; ci < 2; ci++) {
        for (const S of (deep ? findSetups(buffer, x, home, y, 4, isCorner, 60) : setups)) {
          const snap = s.snapshot();
          s.pushSeq(S);
          s.pushSeq(alg.moves);
          s.pushSeq(invertSequence(S));
          if (solvedAt(s.st, home) && countSolved(s.st) > baseCount && othersOk(s.st)) {
            progressed = true;
            break;
          }
          s.rollback(snap);
        }
        if (progressed || ci === 1) break;
        deep = true;
        }
        if (progressed) break;
      }
      if (progressed) break;
    }
    if (!progressed) {
      if (!cycleBreak(s, isCorner, algs, solvedAt, wasSolved, countSolved)) {
        return total - baseCount <= 2 ? 'parity' : 'failed';
      }
    }
  }
  return allSolved(s.st) ? 'done' : 'failed';
}

/** 换循环：把一个未完成块送进缓冲位（不破坏已完成部分） */
function cycleBreak(s, isCorner, algs, solvedAt, wasSolved, countSolved) {
  const SLOTS = isCorner ? CORNERS : EDGES;
  const total = SLOTS.length;
  const buffer = isCorner ? BUFFER_CORNER : BUFFER_EDGE;
  const baseCount = wasSolved.filter(Boolean).length;
  const othersOk = (st) => {
    for (let i = 0; i < total; i++) {
      // 缓冲位外的已完成块必须保持
      if (i !== buffer && wasSolved[i] && !solvedAt(st, i)) return false;
    }
    return true;
  };
  for (const alg of algs) {
    if (!alg.cyc) continue;
    const [p1, p2, p3] = alg.cyc;
    const rots = [
      [p1, p2],
      [p2, p3],
      [p3, p1]
    ];
    for (const [x, y] of rots) {
      for (let i = 0; i < total; i++) {
        if (wasSolved[i] || i === buffer) continue;
        const setups = findSetups(i, x, buffer, y, 3, isCorner, 16);
        for (const S of setups) {
          const snap = s.snapshot();
          s.pushSeq(S);
          s.pushSeq(alg.moves);
          s.pushSeq(invertSequence(S));
          const ok =
            othersOk(s.st) &&
            pieceAt(s.st, buffer, isCorner) !== buffer &&
            countSolved(s.st) >= baseCount - 1;
          if (ok) return true;
          s.rollback(snap);
        }
      }
    }
  }
  return false;
}

/**
 * 收尾：先用 T 型/J 型公式解决"两角两棱互换"；若只剩翻转/扭转的块，
 * 再用通用工具箱逐块求解（保护已完成部分），最后兜底一次宏搜索。
 */
function endgame(s) {
  const isSolved = (st) => (typeof st === 'string' ? st : st.join('')) === SOLVED;
  const solvedList = (st) => {
    const out = { e: [], c: [] };
    for (let i = 0; i < 12; i++) out.e.push(P.edgeSolvedAt(st, i));
    for (let i = 0; i < 8; i++) out.c.push(P.cornerSolvedAt(st, i));
    return out;
  };
  const othersStill = (st, before, skipE, skipC) => {
    for (let i = 0; i < 12; i++) {
      if (i !== skipE && before.e[i] && !P.edgeSolvedAt(st, i)) return false;
    }
    for (let i = 0; i < 8; i++) {
      if (i !== skipC && before.c[i] && !P.cornerSolvedAt(st, i)) return false;
    }
    return true;
  };
  // 收尾顺序（由快到全）：两角两棱互换 → 短宏搜索 → LBL 兜底
  if (parityFinish(s, 2)) return true;
  const rich = P.FULL_MACROS.concat([T_PERM, JB, UA, UB], [['R'], ["R'"], ['L'], ["L'"], ['F'], ["F'"], ['B'], ["B'"], ['D'], ["D'"]]);
  for (let d = 1; d <= 3; d++) {
    if (P.macroSearch(s, isSolved, rich, d)) return true;
  }
  try {
    const res = lbl.solveLbl(s.st);
    s.pushSeq(res.moves);
    return isSolved(s.st);
  } catch (e) {
    return false;
  }
}

/**
 * 奇偶收尾：3 循环无法解决"两角两棱互换"，用 T 型/J 型公式 + 搜索 setup 一次收掉
 */
function parityFinish(s, maxSetup) {
  const limit = maxSetup || 3;
  const algs = [T_PERM, JB];
  const target = (st) => (typeof st === 'string' ? st : st.join('')) === SOLVED;
  const tryOnce = (setup) => {
    P.checkBudget();
    for (const alg of algs) {
      const snap = s.snapshot();
      s.pushSeq(setup);
      s.pushSeq(alg);
      s.pushSeq(invertSequence(setup));
      if (target(s.st)) return true;
      s.rollback(snap);
    }
    return false;
  };
  if (tryOnce([])) return true;
  const path = [];
  let done = false;
  const rec = (depth) => {
    P.checkBudget();
    if (done) return;
    if (depth > 0 && tryOnce(path)) {
      done = true;
      return;
    }
    if (depth === limit) return;
    for (const m of P.ALL_MOVES) {
      path.push(m);
      rec(depth + 1);
      path.pop();
      if (done) return;
    }
  };
  rec(0);
  return done;
}

function throwBlind(msg) {
  const e = new Error(msg);
  e.code = 'BLIND_FAIL';
  throw e;
}

export { solveBlind, parityFinish, endgame, computeMemo, CORNER_LETTERS, EDGE_LETTERS, LETTER_OF_FACELET, BUFFER_CORNER, BUFFER_EDGE, cycleOfAlg, findSetups, EDGE_ALGS, CORNER_ALGS, isHomeOriented, pieceAt, permHasSwapOrOdd };
