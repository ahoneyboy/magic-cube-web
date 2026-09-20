/**
 * pieceSolver.js —— 任意方法共用的"块级构造求解"工具箱
 *
 * 从已验证的 LBL/CFOP 实现中提炼出的通用模式：
 *   定位 → 宏搜索（U 转动 + 目标槽位触发公式，含弹出/插入/翻转/转面）
 *   → 每步「试探 + 谓词验证 + 回滚」，保证不破坏已完成部分
 *
 * 谓词 pred(facelet) 由调用方定义（例如"左桥已复原"、"棱块朝向未破坏"），
 * 因此同一套工具可以搭建 Roux 的桥、ZZ 的 EOLine/F2L、Petrus 的块、盲拧的三循环。
 *
 * 不依赖 wx / DOM，可在 Node 中通用。
 */


import * as cfop from './cfopSolver.js';
import { Cube, FACE_NORMAL, QUARTER, QUARTER_SLICE, QUARTER_WIDE, SOLVED, invertSequence } from './cube.js';
import { CORNERS, EDGES } from './cubies.js';
import * as lbl from './lblSolver.js';
// 合并转动表（含中层 M/E/S 与宽层），位置追踪/快速应用统一用它
const PERM_ALL = Object.assign({}, QUARTER, QUARTER_SLICE, QUARTER_WIDE);

const SIDE_CYCLE = ['F', 'R', 'B', 'L'];

// ---- 全局时间预算：高级解法一次性求解，超时立刻放弃（抛 ADV_TIMEOUT）----
let __deadline = 0;
function setBudget(ms) {
  __deadline = ms > 0 ? Date.now() + ms : 0;
}
function clearBudget() {
  __deadline = 0;
}
function checkBudget() {
  if (__deadline && Date.now() > __deadline) {
    const e = new Error('求解超出时间预算');
    e.code = 'ADV_TIMEOUT';
    throw e;
  }
}

function mapFace(f, k) {
  const i = SIDE_CYCLE.indexOf(f);
  return i < 0 ? f : SIDE_CYCLE[(i + k) % 4];
}
function relabel(seq, k) {
  return seq.map((m) => mapFace(m[0], k) + m.slice(1));
}
// 角块槽位（含两个侧面）→ 对称偏移 k
function kForSlot(pos) {
  const faces = [];
  if (pos[0] === 1) faces.push('R');
  if (pos[0] === -1) faces.push('L');
  if (pos[2] === 1) faces.push('F');
  if (pos[2] === -1) faces.push('B');
  for (let k = 0; k < 4; k++) {
    if (faces.indexOf(mapFace('F', k)) >= 0 && faces.indexOf(mapFace('R', k)) >= 0) return k;
  }
  return 0;
}
// 单侧面槽位（D/U 层棱块）→ 对称偏移 k
function kForSide(side) {
  const i = SIDE_CYCLE.indexOf(side);
  return i < 0 ? 0 : i;
}
function sideFaceOf(pos) {
  if (pos[0] === 1) return 'R';
  if (pos[0] === -1) return 'L';
  if (pos[2] === 1) return 'F';
  if (pos[2] === -1) return 'B';
  return 'F';
}

const U_ALL = [['U'], ["U'"], ['U2']];
const SEXY = ['R', 'U', "R'", "U'"];
const SLEDGE = ["R'", 'F', 'R', "F'"];
const EXTRACT = ['R', 'U', "R'"];
const RIGHT_INSERT = ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'];
const LEFT_INSERT = ["U'", "F'", 'U', 'F', 'U', 'R', "U'", "R'"];
const OLL_EDGE = ['F', 'R', 'U', "R'", "U'", "F'"];
const CORNER_TWIST = ["R'", "D'", 'R', 'D'];

class PSession {
  constructor(facelet) {
    this.cube = new Cube(facelet);
    this.moves = [];
  }
  pushSeq(seq) {
    seq.forEach((m) => {
      this.cube.move(m);
      this.moves.push(m);
    });
    return this;
  }
  get st() {
    return this.cube.getFacelet();
  }
  snapshot() {
    return { st: this.cube.getFacelet(), len: this.moves.length };
  }
  rollback(snap) {
    this.cube.setState(snap.st);
    this.moves.length = snap.len;
  }
}

// ---- 快速谓词与定位（面贴纸直接比较，比块数组快一个量级）----
function edgeSolvedAt(st, slotIdx) {
  const e = EDGES[slotIdx];
  return st[e.facelets[0]] === e.solvedColors[0] && st[e.facelets[1]] === e.solvedColors[1];
}
function cornerSolvedAt(st, slotIdx) {
  const c = CORNERS[slotIdx];
  return (
    st[c.facelets[0]] === c.solvedColors[0] &&
    st[c.facelets[1]] === c.solvedColors[1] &&
    st[c.facelets[2]] === c.solvedColors[2]
  );
}
// Kociemba 约定：角块朝向正确 = U/D 色贴纸位于 U/D 面（facelets[0]）
// 棱块朝向（与 cubies.js 已验证定义一致）：取该槽位当前块自身的基准色
// （有 U/D 色取之，否则取 F/B 色），基准色位于槽位第 0 贴纸位即视为朝向正确。
// 该定义下 R/L/U/D 保持朝向、F/B 翻 4 条棱（ZZ / Roux 的基础）。
function edgeOriented(st, slot) {
  const e = EDGES[slot];
  const c0 = st[e.facelets[0]];
  const c1 = st[e.facelets[1]];
  const hasUD = c0 === 'U' || c0 === 'D' || c1 === 'U' || c1 === 'D';
  return hasUD ? c0 === 'U' || c0 === 'D' : c0 === 'F' || c0 === 'B';
}

function cornerTwistOk(st, slotIdx) {
  const c = CORNERS[slotIdx];
  const ch = st[c.facelets[0]];
  return ch === 'U' || ch === 'D';
}
const EDGE_KEY = EDGES.map((e) => e.solvedColors.slice().sort().join(''));
const CORNER_KEY = CORNERS.map((c) => c.solvedColors.slice().sort().join(''));
function edgeSlotOf(st, pieceId) {
  const want = EDGE_KEY[pieceId];
  for (let i = 0; i < 12; i++) {
    const e = EDGES[i];
    if ([st[e.facelets[0]], st[e.facelets[1]]].sort().join('') === want) return i;
  }
  return -1;
}
function cornerSlotOf(st, pieceId) {
  const want = CORNER_KEY[pieceId];
  for (let i = 0; i < 8; i++) {
    const c = CORNERS[i];
    if ([st[c.facelets[0]], st[c.facelets[1]], st[c.facelets[2]]].sort().join('') === want) return i;
  }
  return -1;
}

// ---- 宏（触发公式）集合 ----
function triggersForK(k, withTwist) {
  const list = [
    relabel(SEXY, k),
    invertSequence(relabel(SEXY, k)),
    relabel(SLEDGE, k),
    invertSequence(relabel(SLEDGE, k)),
    relabel(RIGHT_INSERT, k),
    relabel(LEFT_INSERT, k),
    relabel(EXTRACT, k)
  ];
  if (withTwist) list.push(relabel(CORNER_TWIST, k));
  return list;
}
function primaryMacros(k, withTwist) {
  return U_ALL.concat(triggersForK(k, withTwist));
}
const FULL_MACROS = (() => {
  const list = U_ALL.slice();
  for (let k = 0; k < 4; k++) triggersForK(k, true).forEach((m) => list.push(m));
  list.push(OLL_EDGE);
  return list;
})();

function macroAllowed(m, allow) {
  for (const mv of m) {
    const f = mv[0].toUpperCase();
    if (!allow.has(f)) return false;
  }
  return true;
}
function filterMacros(macros, allow) {
  return allow ? macros.filter((m) => macroAllowed(m, allow)) : macros;
}
function allowSet(allowedFaces) {
  return allowedFaces ? new Set(allowedFaces.map((f) => f.toUpperCase())) : null;
}

// ---- 允许面上的单步 IDDFS（比宏搜索更彻底：能发现 R2/R U2 这类短解）----
const AXIS_OF_FACE = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z', M: 'x', E: 'y', S: 'z' };
function invMove(m) {
  if (m.length === 1) return m + "'";
  if (m[1] === '2') return m;
  return m[0];
}
function movesOfFaces(faces) {
  const out = [];
  (faces || []).forEach((f) => {
    out.push(f, f + "'", f + '2');
  });
  return out;
}
/**
 * 单步 IDDFS：只走 allowedFaces 里的面，逐步加深到 maxDepth；
 * 剪掉"同面连续"与"同轴 A B A"这类冗余，并用节点预算兜住耗时。
 */
function plainSearch(s, target, allowedFaces, maxDepth, nodeBudget) {
  const moves = movesOfFaces(allowedFaces);
  if (!moves.length) return false;
  const budget = nodeBudget || 120000;
  let nodes = 0;
  const dfs = (depth, limit, lastFace, last2Face) => {
    checkBudget();
    if (target(s.st)) return true;
    if (depth === limit) return false;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const f = m[0];
      if (f === lastFace) continue;
      if (last2Face && f === last2Face && AXIS_OF_FACE[f] === AXIS_OF_FACE[lastFace]) continue;
      if (++nodes > budget) return false;
      // 探索阶段直接操作 cube；路径按顺序记录，失败时回退
      s.cube.move(m);
      s.moves.push(m);
      if (dfs(depth + 1, limit, f, lastFace)) return true;
      s.moves.pop();
      s.cube.move(invMove(m));
    }
    return false;
  };
  for (let limit = 1; limit <= maxDepth; limit++) {
    nodes = 0;
    if (dfs(0, limit, null, null)) return true;
  }
  return false;
}

/**
 * 宏搜索：IDDFS，找到第一个满足 pred 的序列（应用到 session 上；失败自动回滚）
 */
function macroSearch(s, pred, macros, maxDepth) {
  const snapshot = s.snapshot();
  const path = [];
  function dfs(depth) {
    checkBudget();
    if (pred(s.st)) return true;
    if (depth === maxDepth) return false;
    for (const m of macros) {
      if (path.length && m[0][0] === path[path.length - 1][0][0]) continue; // 同面连续无意义
      const snap = s.snapshot();
      path.push(m);
      s.pushSeq(m);
      if (dfs(depth + 1)) return true;
      path.pop();
      s.rollback(snap);
    }
    return false;
  }
  if (dfs(0)) return true;
  s.rollback(snapshot);
  return false;
}

/**
 * 逐级搜索：主宏集（目标槽位 + U + 自定义宏）由浅到深，再全宏集兜底
 */
function gradedSearch(s, target, k, withTwist, allow, opts) {
  const extra = (opts && opts.extraMacros) || [];
  const prim = filterMacros(primaryMacros(k, withTwist).concat(extra), allow);
  const full = filterMacros(FULL_MACROS.concat(extra), allow);
  const maxPrim = (opts && opts.maxPrim) || 4;
  const maxFull = (opts && opts.maxFull) || 3;
  for (let d = 1; d <= maxPrim; d++) {
    if (macroSearch(s, target, prim, d)) return true;
    if (d <= 2 && macroSearch(s, target, full, d)) return true;
  }
  if (macroSearch(s, target, full, maxFull)) return true;
  if (macroSearch(s, target, prim, maxPrim + 1)) return true;
  return false;
}

// ---- 受限单步 IDDFS（LBL 十字棱已验证的思路）----
// 每步只允许：U 转动 + 目标块当前接触的侧面。对"任意位置 → 目标槽位"这类
// 求解非常可靠，且深度 7 内可覆盖全部情形。
const NORM_FACE = (() => {
  const m = {};
  Object.keys(FACE_NORMAL).forEach((f) => {
    m[FACE_NORMAL[f].join(',')] = f;
  });
  return m;
})();
const AXIS_OF = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };

function restrictedSearch(s, target, facesOf, maxDepth, allow) {
  const path = [];
  const primFaces = ['U'];
  function dfs(depth, limit, lastFace, last2, curFaces) {
    if (target(s.st)) return true;
    if (depth === limit) return false;
    const allowed = new Set(primFaces);
    curFaces.forEach((f) => allowed.add(f));
    if (lastFace) {
      // 允许继续同面（不同量）没有意义，跳过同面
    }
    for (const f of ['U', 'F', 'R', 'B', 'L', 'D']) {
      if (!allowed.has(f)) continue;
      if (allow && !allow.has(f)) continue;
      if (f === lastFace) continue;
      if (last2 && f === last2 && AXIS_OF[f] === AXIS_OF[lastFace]) continue;
      for (const suf of ['', "'", '2']) {
        const mv = f + suf;
        const snap = s.snapshot();
        s.pushSeq([mv]);
        const nf = facesOf(s.st);
        if (dfs(depth + 1, limit, f, lastFace, nf)) return true;
        s.rollback(snap);
      }
    }
    return false;
  }
  const startFaces = facesOf(s.st);
  for (let limit = 1; limit <= maxDepth; limit++) {
    checkBudget();
    path.length = 0;
    if (dfs(0, limit, null, null, startFaces)) return true;
  }
  return false;
}

// 某棱块当前接触的侧面（不含 U/D）
function edgeFacesOf(st, pieceId) {
  const slot = edgeSlotOf(st, pieceId);
  if (slot < 0) return ['F', 'R'];
  const out = [];
  EDGES[slot].normals.forEach((n) => {
    const f = NORM_FACE[n.join(',')];
    if (f && f !== 'U' && f !== 'D') out.push(f);
  });
  return out.length ? out : ['F'];
}
// 某角块当前接触的侧面
function cornerFacesOf(st, pieceId) {
  const slot = cornerSlotOf(st, pieceId);
  if (slot < 0) return ['F', 'R'];
  const out = [];
  CORNERS[slot].normals.forEach((n) => {
    const f = NORM_FACE[n.join(',')];
    if (f && f !== 'U' && f !== 'D') out.push(f);
  });
  return out.length ? out : ['F', 'R'];
}

// ---- 带状态去重的 BFS（单块求解首选：最短解、可靠）----
const ALL_MOVES = (() => {
  const out = [];
  ['U', 'R', 'F', 'D', 'L', 'B'].forEach((f) => out.push(f, f + "'", f + '2'));
  return out;
})();

function applyMoveToArray(arr, m) {
  const perm = PERM_ALL[m[0]];
  const times = m.length === 1 ? 1 : m[1] === '2' ? 2 : 3;
  for (let t = 0; t < times; t++) {
    const next = new Array(54);
    for (let i = 0; i < 54; i++) next[perm[i]] = arr[i];
    for (let i = 0; i < 54; i++) arr[i] = next[i];
  }
}

/**
 * BFS 求解：target 接受字符串或字符数组（谓词只做下标比较即可通用）
 * 找到最短序列并应用到 session。
 */
function bfsSolve(s, target, opts) {
  opts = opts || {};
  const maxDepth = opts.maxDepth || 7;
  const cap = opts.cap || 50000;
  const allow = allowSet(opts.allowedFaces);
  const moves = opts.moves ? opts.moves.slice() : allow ? ALL_MOVES.filter((m) => allow.has(m[0])) : ALL_MOVES;
  // 状态以"字符串"存放（54 字符）：比逐节点数组省 ~6 倍内存，小程序端更稳；
  // keyOf 可按"投影"去重（只关心若干特征时，状态空间小几个数量级）。
  const keyOf = opts.keyOf || ((st) => st);
  const start = s.st;
  if (target(start)) return true;
  const seen = new Set([keyOf(start)]);
  let frontier = [{ st: start, parent: null, mv: null }];
  for (let d = 1; d <= maxDepth; d++) {
    checkBudget();
    const next = [];
    for (const node of frontier) {
      const baseArr = node.st.split('');
      for (const m of moves) {
        const arr = baseArr.slice();
        applyMoveToArray(arr, m);
        const st = arr.join('');
        const key = keyOf(st);
        if (seen.has(key)) continue;
        if (target(st)) {
          const path = [m];
          let p = node;
          while (p && p.mv) {
            path.unshift(p.mv);
            p = p.parent;
          }
          s.pushSeq(path);
          return true;
        }
        seen.add(key);
        next.push({ st, parent: node, mv: m });
      }
    }
    frontier = next;
    if (seen.size > cap) return false;
  }
  return false;
}

// ---- 确定性构造式求解（不靠搜索：LBL 验证过 2000 例的手法）----
// 角块：把块转到目标槽"正上方" → 反复做右手公式（或其逆）直到回家
// 中层棱：把块转到目标槽上方对齐 → 用右插/左插（或其逆）送进去
const CORNER_ABOVE = (slotIdx) => {
  const p = CORNERS[slotIdx].pos;
  for (let i = 0; i < 8; i++) {
    if (CORNERS[i].pos[0] === p[0] && CORNERS[i].pos[2] === p[2] && CORNERS[i].pos[1] === 1) return i;
  }
  return -1;
};
const EDGE_ABOVE = (slotIdx) => {
  const p = EDGES[slotIdx].pos;
  for (let i = 0; i < 12; i++) {
    if (EDGES[i].pos[0] === p[0] && EDGES[i].pos[2] === p[2] && EDGES[i].pos[1] === 1) return i;
  }
  return -1;
};

/**
 * 确定性构造：把某块送回家（带谓词保护与逐步校验）
 * @returns {boolean}
 */
function constructivePiece(s, pieceIdx, isCorner, pred, allowedFaces) {
  const allow = allowSet(allowedFaces);
  const SLOTS = isCorner ? CORNERS : EDGES;
  const slotOf = (st, idx) => (isCorner ? cornerSlotOf(st, idx) : edgeSlotOf(st, idx));
  const solvedAt = (st, idx) =>
    isCorner ? cornerSolvedAt(st, idx) : edgeSolvedAt(st, idx);
  const target = (st) => solvedAt(st, pieceIdx) && pred(st);
  if (target(s.st)) return true;
  const startSnap = s.snapshot();
  const fail = () => {
    s.rollback(startSnap);
    return false;
  };
  const k = isCorner ? kForSlot(SLOTS[pieceIdx].pos) : kForSide(sideFaceOf(SLOTS[pieceIdx].pos));
  const setup = (seq) => {
    if (allow && !macroAllowed(seq, allow)) return false;
    const snap = s.snapshot();
    s.pushSeq(seq);
    if (target(s.st)) return true;
    s.rollback(snap);
    return false;
  };

  for (let guard = 0; guard < 8; guard++) {
    if (target(s.st)) return true;
    const curSlot = slotOf(s.st, pieceIdx);
    if (curSlot < 0) return false;
    // 1) 块在 D 层（角）或中层（棱）且不是自己家 → 先弹到顶层
    const inWrongLayer = isCorner
      ? curSlot !== pieceIdx && SLOTS[curSlot].pos[1] === -1
      : curSlot !== pieceIdx && SLOTS[curSlot].pos[1] === 0;
    if (inWrongLayer) {
      if (extractPieceToU(s, pieceIdx, isCorner, pred, allowedFaces)) continue;
      // 弹出失败：允许临时破坏（后续步骤会复位），先把块抬上来
      let lifted = false;
      for (let kk = 0; kk < 4 && !lifted; kk++) {
        for (const base of isCorner ? [SEXY, EXTRACT, SLEDGE] : [EXTRACT, SEXY, SLEDGE, RIGHT_INSERT, LEFT_INSERT]) {
          const seq = relabel(base, kk);
          if (allow && !macroAllowed(seq, allow)) continue;
          const snap = s.snapshot();
          s.pushSeq(seq);
          const slotNow = slotOf(s.st, pieceIdx);
          if (slotNow >= 0 && SLOTS[slotNow].pos[1] === 1) lifted = true;
          else s.rollback(snap);
        }
      }
      if (!lifted) return fail();
      continue;
    }
    // 2) 块在顶层 → 转到目标槽正上方
    if (SLOTS[curSlot].pos[1] === 1) {
      const want = isCorner ? CORNER_ABOVE(pieceIdx) : EDGE_ABOVE(pieceIdx);
      if (want < 0) return fail();
      let aligned = curSlot === want;
      for (let t = 0; t < 3 && !aligned; t++) {
        const snap = s.snapshot();
        s.pushSeq(['U']);
        const now = slotOf(s.st, pieceIdx);
        if (now === want) aligned = true;
        else s.rollback(snap);
      }
      if (!aligned) return fail();
      // 3) 反复做插入公式（最多 5 次），每次校验保护
      const reps = isCorner ? [SEXY, invertSequence(SEXY)] : [relabel(RIGHT_INSERT, k), relabel(LEFT_INSERT, k)];
      for (const rep of reps) {
        if (allow && !macroAllowed(rep, allow)) continue;
        let seqRep = rep;
        for (let t = 1; t <= 5; t++) {
          if (allow && !macroAllowed(seqRep, allow)) break;
          if (setup(seqRep)) return true;
          seqRep = seqRep.concat(rep);
        }
      }
      return fail();
    }
    // 3) 块已在正确的 D 层槽位但朝向不对（角块扭转）：用右手公式微调
    if (isCorner && curSlot === pieceIdx) {
      for (let kk = 0; kk < 4; kk++) {
        const seq = relabel(CORNER_TWIST, kk);
        if (allow && !macroAllowed(seq, allow)) continue;
        let trial = seq;
        for (let t = 1; t <= 2; t++) {
          if (setup(trial)) return true;
          trial = trial.concat(seq);
        }
      }
      return fail();
    }
    return fail();
  }
  return target(s.st);
}

/** 求解单个棱块到目标槽位（朝向正确），pred 保护已完成部分 */
function solveEdgeTo(s, slotIdx, pred, opts) {
  opts = opts || {};
  const allow = allowSet(opts.allowedFaces);
  const target = (st) => edgeSolvedAt(st, slotIdx) && pred(st);
  if (target(s.st)) return true;
  if (constructivePiece(s, slotIdx, false, pred, opts.allowedFaces)) return true;
  if (bfsSolve(s, target, { maxDepth: opts.bfsDepth || 7, cap: opts.bfsCap || 60000, allowedFaces: opts.allowedFaces })) return true;
  const facesOf = (st) => edgeFacesOf(st, slotIdx);
  if (restrictedSearch(s, target, facesOf, (opts.maxDepth || 4) + 3, allow)) return true;
  const k = kForSide(sideFaceOf(EDGES[slotIdx].pos));
  if (gradedSearch(s, target, k, false, allow, opts)) return true;
  // 最后兜底：允许面上的单步 IDDFS（能发现 R2/R U2 这类宏集覆盖不到的短解）
  const faces = opts.allowedFaces || ['U', 'R', 'L', 'D', 'F', 'B'];
  return plainSearch(s, target, faces, opts.plainDepth || 9, opts.plainBudget);
}

/** 求解单个角块到目标槽位（朝向正确），pred 保护已完成部分 */
function solveCornerTo(s, slotIdx, pred, opts) {
  opts = opts || {};
  const allow = allowSet(opts.allowedFaces);
  const target = (st) => cornerSolvedAt(st, slotIdx) && pred(st);
  if (target(s.st)) return true;
  if (constructivePiece(s, slotIdx, true, pred, opts.allowedFaces)) return true;
  if (bfsSolve(s, target, { maxDepth: opts.bfsDepth || 7, cap: opts.bfsCap || 60000, allowedFaces: opts.allowedFaces })) return true;
  const facesOf = (st) => cornerFacesOf(st, slotIdx);
  if (restrictedSearch(s, target, facesOf, (opts.maxDepth || 4) + 3, allow)) return true;
  const k = kForSlot(CORNERS[slotIdx].pos);
  if (gradedSearch(s, target, k, true, allow, opts)) return true;
  const faces = opts.allowedFaces || ['U', 'R', 'L', 'D', 'F', 'B'];
  return plainSearch(s, target, faces, opts.plainDepth || 9, opts.plainBudget);
}

/** 求解棱角对（D 层角块 + 相邻中层棱块）到目标槽位，CFOP F2L 同款 */
// 构造式配对求解（移植自 CFOP 已验证实现，谓词可配）：
//   角/棱在错误位置 → 试探式弹出到顶层；两件都在顶层 → 目标槽位触发公式的 IDDFS
const SLICE_CANDIDATES = [['M'], ["M'"], ['M2'], ['E'], ["E'"], ['E2'], ['S'], ["S'"], ['S2']];
function extractPieceToU(s, pieceIdx, isCorner, pred, allowedFaces) {
  const allow = allowSet(allowedFaces);
  const k = isCorner ? kForSlot(CORNERS[pieceIdx].pos) : kForSide(sideFaceOf(EDGES[pieceIdx].pos));
  const bases = isCorner ? [SEXY, SLEDGE, EXTRACT] : [SEXY, SLEDGE, RIGHT_INSERT, LEFT_INSERT, EXTRACT];
  const inU = (st, idx) => {
    const slot = isCorner ? cornerSlotOf(st, idx) : edgeSlotOf(st, idx);
    if (slot < 0) return false;
    return (isCorner ? CORNERS[slot] : EDGES[slot]).pos[1] === 1;
  };
  // 切片转动（M/E/S）：块卡在中层（如 DF/DB）时，只有切片能把它带上来
  if (allow) {
    for (const seq of SLICE_CANDIDATES) {
      if (!macroAllowed(seq, allow)) continue;
      const snap = s.snapshot();
      s.pushSeq(seq);
      if (inU(s.st, pieceIdx) && pred(s.st)) return true;
      s.rollback(snap);
    }
  }
  for (const kk of [k, (k + 1) % 4, (k + 2) % 4, (k + 3) % 4]) {
    for (const base of bases) {
      for (const seq of [relabel(base, kk), invertSequence(relabel(base, kk))]) {
        if (allow && !macroAllowed(seq, allow)) continue;
        const snap = s.snapshot();
        s.pushSeq(seq);
        if (inU(s.st, pieceIdx) && pred(s.st)) return true;
        s.rollback(snap);
      }
    }
  }
  return false;
}

function solvePairConstructive(s, cornerSlotIdx, edgeSlotIdx, pred, opts) {
  opts = opts || {};
  const k = kForSlot(CORNERS[cornerSlotIdx].pos);
  const target = (st) =>
    cornerSolvedAt(st, cornerSlotIdx) && edgeSolvedAt(st, edgeSlotIdx) && pred(st);
  const allow = allowSet(opts.allowedFaces);
  const macros = (opts.extraMacros || [])
    .concat(U_ALL, [
      relabel(SEXY, k),
      invertSequence(relabel(SEXY, k)),
      relabel(SLEDGE, k),
      invertSequence(relabel(SLEDGE, k)),
      relabel(RIGHT_INSERT, k),
      relabel(LEFT_INSERT, k),
      relabel(EXTRACT, k),
      relabel(EXTRACT, (k + 1) % 4),
      relabel(EXTRACT, (k + 2) % 4),
      relabel(EXTRACT, (k + 3) % 4)
    ])
    .filter((m) => !allow || macroAllowed(m, allow));
  for (let guard = 0; guard < 14; guard++) {
    checkBudget();
    if (target(s.st)) return true;
    const cs = cornerSlotOf(s.st, cornerSlotIdx);
    const es = edgeSlotOf(s.st, edgeSlotIdx);
    if (cs < 0 || es < 0) return false;
    const faces = opts.allowedFaces || ['U', 'R', 'L', 'D', 'F', 'B'];
    // 角块在 D 层但不在自己家 → 弹出到顶层
    if (cs !== cornerSlotIdx && CORNERS[cs].pos[1] === -1) {
      if (extractPieceToU(s, cornerSlotIdx, true, pred, opts.allowedFaces)) continue;
      // 弹出失败：交给单步 IDDFS 整体求解
      return plainSearch(s, target, faces, opts.plainDepth || 10, opts.plainBudget);
    }
    // 棱块在中层但不在自己位 → 弹出到顶层
    if (es !== edgeSlotIdx && EDGES[es].pos[1] === 0) {
      if (extractPieceToU(s, edgeSlotIdx, false, pred, opts.allowedFaces)) continue;
      return plainSearch(s, target, faces, opts.plainDepth || 10, opts.plainBudget);
    }
    // 两件都在顶层：插入搜索（宏 → 单步 IDDFS 兜底）
    let inserted = false;
    for (let d = 1; d <= (opts.maxPrim || 6) && !inserted; d++) {
      inserted = macroSearch(s, target, macros, d);
    }
    if (inserted) continue;
    if (plainSearch(s, target, faces, opts.plainDepth || 10, opts.plainBudget)) continue;
    return false;
  }
  return target(s.st);
}


function solvePairTo(s, cornerSlotIdx, edgeSlotIdx, pred, opts) {
  opts = opts || {};
  const k = kForSlot(CORNERS[cornerSlotIdx].pos);
  const allow = allowSet(opts.allowedFaces);
  const target = (st) => cornerSolvedAt(st, cornerSlotIdx) && edgeSolvedAt(st, edgeSlotIdx) && pred(st);
  if (target(s.st)) return true;
  const facesOf = (st) => cornerFacesOf(st, cornerSlotIdx).concat(edgeFacesOf(st, edgeSlotIdx));
  if (restrictedSearch(s, target, facesOf, (opts.maxDepth || 5) + 3, allow)) return true;
  return gradedSearch(s, target, k, true, allow, opts);
}

// ---- 组合谓词 ----
function blockPred(edgeIdxs, cornerIdxs) {
  return (st) => edgeIdxs.every((i) => edgeSolvedAt(st, i)) && cornerIdxs.every((i) => cornerSolvedAt(st, i));
}
function andPred() {
  const preds = Array.prototype.slice.call(arguments);
  return (st) => preds.every((p) => p(st));
}
function orPred(a, b) {
  return (st) => a(st) || b(st);
}
// 整体复原（允许顶层整体转动 AUF）
function solvedUpToAUF(st) {
  if (st === SOLVED) return true;
  const c = new Cube(st);
  for (let k = 0; k < 4; k++) {
    if (c.getFacelet() === SOLVED) return true;
    c.move('U');
  }
  return false;
}
// 一组 U 层角块「已复位（允许整体 AUF 偏差）」
function uCornersSolvedUpToAUF(st) {
  const U_CORNERS = [];
  CORNERS.forEach((c, i) => {
    if (c.pos[1] === 1) U_CORNERS.push(i);
  });
  for (let k = 0; k < 4; k++) {
    const probe = k === 0 ? st : (() => {
      const c = new Cube(st);
      for (let i = 0; i < k; i++) c.move('U');
      return c.getFacelet();
    })();
    if (U_CORNERS.every((i) => cornerSolvedAt(probe, i))) return true;
  }
  return false;
}

/**
 * 通用收尾：把剩余部分交给已验证的 LBL 求解器（高级方法特定阶段未求出解时使用，
 * 实现在页面上会如实标注"通用手法收尾"，不冒充该方法本身的步骤）
 */
function finishWithLbl(s, stages, note) {
  // 收尾前清掉时间预算：否则"预算已到期"会让收尾搜索也立刻超时，最终交不出解
  clearBudget();
  const from = s.moves.length;
  // 桥式/块构建可能用过 M 转动，中心块会整体转走；LBL 需要标准朝向，先转回来
  // 中心贴纸下标：U=4, R=13, F=22, D=31（L=40, B=49）
  const aligned = (st) => st[4] === 'U' && st[13] === 'R' && st[22] === 'F' && st[31] === 'D';
  if (!aligned(s.st)) {
    for (const seq of [['M'], ['M2'], ["M'"]]) {
      const snap = s.snapshot();
      s.pushSeq(seq);
      if (aligned(s.st)) break;
      s.rollback(snap);
    }
  }
  let ok = false;
  // 优先 CFOP（同一状态平均比层先法短 40% 左右），失败再退层先法
  try {
    const res = cfop.solveCFOP(s.st);
    s.pushSeq(res.moves);
    ok = s.st === SOLVED;
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    try {
      const res = lbl.solveLbl(s.st);
      s.pushSeq(res.moves);
      ok = s.st === SOLVED;
    } catch (e) {
      ok = false;
    }
  }
  if (stages) {
    stages.push({
      id: 'lbl-tail',
      title: '通用手法收尾',
      hint: note || '本方法特定阶段未求出解，剩余部分用通用层先法补齐',
      emoji: '🧰',
      from,
      moves: s.moves.slice(from)
    });
  }
  return ok;
}

// ---- 带"守护块"的投影键 BFS：把某块送回家，同时保证指定块不被留在坏位置 ----
// 键 = 目标块 + 守护块的（槽位, 朝向位）。这些块的状态完全决定它们之后的演化，
// 因此按键去重是可靠的；状态空间只有几千~几十万，BFS 能穷尽并给出最短解。
function pieceStateKey(st, pieces) {
  let k = '';
  for (const pc of pieces) {
    const slot = pc.type === 'e' ? edgeSlotOf(st, pc.idx) : cornerSlotOf(st, pc.idx);
    const sIdx = slot < 0 ? 0 : slot;
    k += String.fromCharCode(65 + sIdx);
    k += pc.type === 'e' ? (edgeOriented(st, sIdx) ? '1' : '0') : (cornerTwistOk(st, sIdx) ? '1' : '0');
  }
  return k;
}
/**
 * 投影键 BFS：目标 = pieces[0] 归位（其余 pieces 为守护块，也必须保持归位）
 * @returns {boolean}
 */
function projectedPieceSolve(s, pieces, moves, maxDepth, cap) {
  const target = (st) => pieces.every((pc) =>
    pc.type === 'e' ? edgeSolvedAt(st, pc.idx) : cornerSolvedAt(st, pc.idx)
  );
  return bfsSolve(s, target, {
    moves,
    maxDepth: maxDepth || 12,
    cap: cap || 200000,
    keyOf: (st) => pieceStateKey(st, pieces)
  });
}

// ---- 整块构建：逐块求解 + 卡住时轻微扰动重试 ----
function pieceSolved(st, p) {
  return p.type === 'e' ? edgeSolvedAt(st, p.idx) : cornerSolvedAt(st, p.idx);
}
/**
 * 构造一个块（桥 / 2×2×3 等）
 * @param edges 棱块槽位列表（按求解优先顺序）
 * @param corners 角块槽位列表（按求解优先顺序）
 * @param pred 需保护的外部不变量（例如已完成的其他块）
 */
function solveBlockPieces(s, edges, corners, pred, opts) {
  opts = opts || {};
  // opts.order：显式指定求解顺序（[{type:'e'|'c', idx}]），默认先棱后角
  const pieces =
    opts.order && opts.order.length
      ? opts.order.slice()
      : edges.map((i) => ({ type: 'e', idx: i })).concat(corners.map((i) => ({ type: 'c', idx: i })));
  const solvedCount = (st) => pieces.filter((p) => pieceSolved(st, p)).length;
  const total = pieces.length;
  const guardLimit = opts.retries || 40;
  for (let guard = 0; guard < guardLimit; guard++) {
    checkBudget();
    // 阶段时限：到点就放弃（让调用方快速降级，不用把整局预算耗光）
    if (opts.deadline && Date.now() > opts.deadline) return false;
    if (solvedCount(s.st) === total && pred(s.st)) return true;
    const unsolved = pieces.filter((p) => !pieceSolved(s.st, p));
    const others = pieces.filter((p) => pieceSolved(s.st, p));
    const guardPred = (st) => pred(st) && others.every((p) => pieceSolved(st, p));
    let progressed = false;
    for (const p of unsolved) {
      const ok =
        p.type === 'e'
          ? solveEdgeTo(s, p.idx, guardPred, opts)
          : solveCornerTo(s, p.idx, guardPred, opts);
      if (ok) {
        progressed = true;
        break;
      }
    }
    if (progressed) continue;
    // 所有未完成块都卡住 → 轻微扰动：优先保持已解决块数不下降
    const base = solvedCount(s.st);
    const cands = [];
    for (const m of ALL_MOVES) {
      const snap = s.snapshot();
      s.pushSeq([m]);
      const c = solvedCount(s.st);
      s.rollback(snap);
      if (c >= base) cands.push(m);
    }
    if (!cands.length) return false;
    s.pushSeq([cands[(Math.random() * cands.length) | 0]]);
  }
  return solvedCount(s.st) === total && pred(s.st);
}

export { PERM_ALL, PSession, macroSearch, gradedSearch, restrictedSearch, bfsSolve, solveEdgeTo, solveCornerTo, solvePairTo, solvePairConstructive, constructivePiece, plainSearch, movesOfFaces, finishWithLbl, extractPieceToU, solveBlockPieces, projectedPieceSolve, pieceStateKey, ALL_MOVES, setBudget, clearBudget, checkBudget, edgeFacesOf, cornerFacesOf, edgeSolvedAt, cornerSolvedAt, cornerTwistOk, edgeOriented, edgeSlotOf, cornerSlotOf, blockPred, andPred, orPred, solvedUpToAUF, uCornersSolvedUpToAUF, relabel, kForSlot, kForSide, sideFaceOf, triggersForK, primaryMacros, FULL_MACROS, U_ALL, SEXY, SLEDGE, EXTRACT, RIGHT_INSERT, LEFT_INSERT, OLL_EDGE, CORNER_TWIST };
