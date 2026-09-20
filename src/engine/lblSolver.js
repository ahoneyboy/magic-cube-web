/**
 * lblSolver.js —— 层先法（Layer-By-Layer）求解器
 *
 * 特点：
 * - 纯 JS、零依赖、同步求解，任何环境可用（不依赖 npm 构建 / Worker）
 * - 解法天然按 7 个教学阶段分组输出，直接支撑 P6 跟做模式与 P8 教学演示
 * - 所有模板算法通过「U 轴对称重标记 + 试探验证 + 回滚」套用到任意槽位，
 *   每个阶段结束都有守恒断言，不会输出死状态
 *
 * 朝向约定与全项目一致（facelet 字母：U=白 R=红 F=绿 D=黄 L=橙 B=蓝，
 * 见 config/index.js）；"白底黄顶"教学朝向由调用方先做整体 y 旋转再传入。
 */



import * as lib from './config/algLibrary.js';
import { Cube, QUARTER, SOLVED } from './cube.js';
import { CORNERS, EDGES, pieceArrays } from './cubies.js';
import * as moveOpt from './moveOpt.js';
// ---- 槽位索引 ----
const EDGE_SLOT = new Map();
EDGES.forEach((e, i) => EDGE_SLOT.set(e.solvedColors.join(''), i));
const CORNER_SLOT = new Map();
CORNERS.forEach((c, i) => CORNER_SLOT.set(c.solvedColors.join(''), i));

const FACE_OF_NORMAL = {
  '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B'
};
const FACE_START = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
const AXIS_OF = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
const SIDE_CYCLE = ['F', 'R', 'B', 'L'];

function row(f, r) {
  const s = FACE_START[f];
  return [s + r * 3, s + r * 3 + 1, s + r * 3 + 2];
}
function allEqual(st, idx, ch) {
  for (let i = 0; i < idx.length; i++) if (st[idx[i]] !== ch) return false;
  return true;
}

// ---- 阶段谓词 ----
function edgeSlotSolved(st, slotIdx) {
  const e = EDGES[slotIdx];
  return st[e.facelets[0]] === e.solvedColors[0] && st[e.facelets[1]] === e.solvedColors[1];
}
const isDCross = (st) =>
  ['DF', 'DR', 'DB', 'DL'].every((k) => edgeSlotSolved(st, EDGE_SLOT.get(k)));
const isFirstLayer = (st) =>
  isDCross(st) &&
  allEqual(st, row('D', 0).concat(row('D', 1), row('D', 2)), 'D') &&
  allEqual(st, row('F', 2), 'F') &&
  allEqual(st, row('R', 2), 'R') &&
  allEqual(st, row('L', 2), 'L') &&
  allEqual(st, row('B', 2), 'B');
const isTwoLayers = (st) =>
  isFirstLayer(st) &&
  allEqual(st, row('F', 1), 'F') &&
  allEqual(st, row('R', 1), 'R') &&
  allEqual(st, row('L', 1), 'L') &&
  allEqual(st, row('B', 1), 'B');
const isUCross = (st) => st[1] === 'U' && st[3] === 'U' && st[5] === 'U' && st[7] === 'U';
const isUFace = (st) => allEqual(st, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'U');

const UCORNER_SLOTS = [];
const UEDGE_SLOTS = [];
CORNERS.forEach((c, i) => {
  if (c.pos[1] === 1) UCORNER_SLOTS.push(i);
});
EDGES.forEach((e, i) => {
  if (e.pos[1] === 1) UEDGE_SLOTS.push(i);
});

function topCornersPermuted(st) {
  return UCORNER_SLOTS.every((slotIdx) => {
    const c = CORNERS[slotIdx];
    return st[c.facelets[1]] === c.solvedColors[1] && st[c.facelets[2]] === c.solvedColors[2];
  });
}
function topEdgesPermuted(st) {
  return UEDGE_SLOTS.every((slotIdx) => {
    const e = EDGES[slotIdx];
    return st[e.facelets[1]] === e.solvedColors[1];
  });
}

// ---- U 轴对称重标记 ----
function mapFace(f, k) {
  const i = SIDE_CYCLE.indexOf(f);
  return i < 0 ? f : SIDE_CYCLE[(i + k) % 4];
}
function relabel(seq, k) {
  return seq.map((m) => mapFace(m[0], k) + m.slice(1));
}

// ---- 模板算法（基础朝向） ----
const SEXY = ['R', 'U', "R'", "U'"];
const EXTRACT = ['R', 'U', "R'"];
const RIGHT_INSERT = ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'];
const LEFT_INSERT = ["U'", "L'", 'U', 'L', 'U', 'F', "U'", "F'"];
const OLL_EDGE = ['F', 'R', 'U', "R'", "U'", "F'"];
const SUNE = ['R', 'U', "R'", 'U', 'R', 'U2', "R'"];
const ANTISUNE = ['R', 'U2', "R'", "U'", 'R', "U'", "R'"];
// Aa/Ab：纯角块三循环（保持棱块与顶面朝向不变）
const CORNER_PERM_A = ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'];
const CORNER_PERM_B = invertSeqConst(CORNER_PERM_A);
const EDGE_PERM_A = ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'];
const EDGE_PERM_B = ['R2', 'U', 'R', 'U', "R'", "U'", "R'", "U'", "R'", 'U', "R'"];

function invertSeqConst(seq) {
  const inv = [];
  for (const m of seq.slice().reverse()) {
    if (m.length === 2 && m[1] === '2') inv.push(m);
    else if (m.endsWith("'")) inv.push(m[0]);
    else inv.push(m + "'");
  }
  return inv;
}

// ---- 会话：执行 + 记录 + 快照回滚 ----
class LblSession {
  constructor(facelet) {
    this.cube = new Cube(facelet);
    this.moves = [];
    this.stages = [];
  }
  push(m) {
    this.cube.move(m);
    this.moves.push(m);
    return this;
  }
  pushSeq(seq) {
    for (const m of seq) this.push(m);
    return this;
  }
  get st() {
    return this.cube.getFacelet();
  }
  get pa() {
    return pieceArrays(this.cube.getFacelet());
  }
  snapshot() {
    return { st: this.cube.getFacelet(), len: this.moves.length };
  }
  rollback(snap) {
    this.cube.setState(snap.st);
    this.moves.length = snap.len;
  }
  beginStage(id, title, hint) {
    this.stages.push({ id, title, hint, from: this.moves.length, moves: [] });
    return this;
  }
  endStage() {
    const s = this.stages[this.stages.length - 1];
    s.moves = this.moves.slice(s.from);
    return this;
  }
}

// ---------------------------------------------------------------------------
// 阶段 1：底层十字 —— 逐棱受限小搜索（可用动作 = U + 该棱当前接触面 + 目标面）
// ---------------------------------------------------------------------------
function applyMovesToArr(arr, m) {
  const perm = QUARTER[m[0]];
  const times = m.length === 1 ? 1 : m[1] === '2' ? 2 : 3;
  for (let t = 0; t < times; t++) {
    const next = new Array(54);
    for (let i = 0; i < 54; i++) next[perm[i]] = arr[i];
    for (let i = 0; i < 54; i++) arr[i] = next[i];
  }
}

function slotFacesOfEdge(slotIdx) {
  return EDGES[slotIdx].normals.map((n) => FACE_OF_NORMAL[n.join(',')]);
}

function crossEdgeOkFast(st, pieceId, protectedSlots) {
  const target = EDGES[pieceId];
  if (st[target.facelets[0]] !== target.solvedColors[0] || st[target.facelets[1]] !== target.solvedColors[1]) {
    return false;
  }
  for (const s2 of protectedSlots) {
    const e = EDGES[s2];
    if (st[e.facelets[0]] !== e.solvedColors[0] || st[e.facelets[1]] !== e.solvedColors[1]) return false;
  }
  return true;
}

function locateEdge(st, pieceId) {
  const colors = EDGES[pieceId].solvedColors.slice().sort().join('');
  for (let i = 0; i < 12; i++) {
    const e = EDGES[i];
    const got = [st[e.facelets[0]], st[e.facelets[1]]].sort().join('');
    if (got === colors) return i;
  }
  return -1;
}

// 构造式求解单条十字棱；若计划动作会破坏受保护（已完成）的棱，返回 false 交给搜索。
function crossEdgeConstructive(s, pieceId, protectedSlots) {
  const target = EDGES[pieceId];
  const X = target.solvedColors[1]; // 侧色
  const dSlotOfFace = {};
  EDGES.forEach((e, i) => {
    if (e.pos[1] === -1) dSlotOfFace[FACE_OF_NORMAL[e.normals[1].join(',')]] = i;
  });
  const breaks = (face) => {
    const dSlot = dSlotOfFace[face];
    return dSlot != null && protectedSlots.indexOf(dSlot) >= 0;
  };
  for (let round = 0; round < 4; round++) {
    if (edgeSlotSolved(s.st, pieceId)) return true;
    const slotIdx = locateEdge(s.st, pieceId);
    const pos = EDGES[slotIdx].pos;
    if (pos[1] === -1) {
      // 在 D 层：绕侧面 180° 抬到 U 层（目标槽翻转/错位时）
      const sideFace = FACE_OF_NORMAL[EDGES[slotIdx].normals[1].join(',')];
      if (sideFace !== X && breaks(sideFace)) return false;
      s.push(sideFace + '2');
      continue;
    }
    if (pos[1] === 1) {
      if (s.st[EDGES[slotIdx].facelets[0]] === 'D') {
        // 白色朝上：转 U 到 U-X 槽（侧色与面一致）后 X2 插入（只触碰目标槽，永远安全）
        for (let k = 0; k < 4; k++) {
          const cur = locateEdge(s.st, pieceId);
          const sf = FACE_OF_NORMAL[EDGES[cur].normals[1].join(',')];
          if (sf === X) break;
          s.push('U');
        }
        const cur = locateEdge(s.st, pieceId);
        const sf = FACE_OF_NORMAL[EDGES[cur].normals[1].join(',')];
        if (sf !== X) return false;
        s.push(X + '2');
        continue;
      }
      // 翻转在 U 层（D 色贴纸朝向侧面 sideFace）：模板 [sideFace, 邻面', U, sideFace2]
      const sideFace = FACE_OF_NORMAL[EDGES[slotIdx].normals[1].join(',')];
      const a = SIDE_CYCLE[(SIDE_CYCLE.indexOf(sideFace) + 1) % 4];
      if (breaks(sideFace) || breaks(a)) return false; // 会破坏受保护棱
      s.push(sideFace);
      s.push(a + "'");
      s.push('U');
      s.push(sideFace + '2');
      continue;
    }
    // 中间层：用 R/L 侧面逆转抬到 U 层
    const faces = EDGES[slotIdx].normals.map((n) => FACE_OF_NORMAL[n.join(',')]);
    if (breaks(faces[1])) return false;
    s.push(faces[1] + "'");
    continue;
  }
  return edgeSlotSolved(s.st, pieceId);
}

function solveCrossEdgeSearch(s, key, protectedSlots) {
  const pieceId = EDGE_SLOT.get(key);
  const targetSlot = pieceId;

  if (crossEdgeOkFast(s.st, pieceId, protectedSlots)) return;

  const targetFaceSet = slotFacesOfEdge(targetSlot);
  const moves = [];
  ['F', 'R', 'B', 'L'].forEach((f) => {
    if (targetFaceSet.indexOf(f) >= 0) moves.push(f, f + "'", f + '2');
  });
  moves.push('U', "U'", 'U2');
  ['F', 'R', 'B', 'L'].forEach((f) => {
    if (targetFaceSet.indexOf(f) < 0) moves.push(f, f + "'", f + '2');
  });

  const path = [];
  function dfs(arr, curSlot, depth, limit, lastFace, last2) {
    const str = arr.join('');
    if (crossEdgeOkFast(str, pieceId, protectedSlots)) return true;
    if (depth === limit) return false;
    // 可用动作：U + 该棱当前接触的面（目标面在 moves 里已排前）
    const allowed = new Set(['U']);
    if (curSlot >= 0) slotFacesOfEdge(curSlot).forEach((f) => allowed.add(f));
    for (const m of moves) {
      const f = m[0];
      if (!allowed.has(f)) continue;
      if (f === lastFace) continue;
      if (last2 && f === last2 && AXIS_OF[f] === AXIS_OF[lastFace]) continue;
      const copy = arr.slice();
      applyMovesToArr(copy, m);
      path.push(m);
      if (dfs(copy, locateEdge(copy.join(''), pieceId), depth + 1, limit, f, lastFace)) return true;
      path.pop();
    }
    return false;
  }

  const startArr = s.st.split('');
  for (let limit = 1; limit <= 7; limit++) {
    path.length = 0;
    if (dfs(startArr.slice(), locateEdge(s.st, pieceId), 0, limit, null, null)) {
      for (const m of path) s.push(m);
      if (!crossEdgeOkFast(s.st, pieceId, protectedSlots)) {
        const e = new Error('十字棱搜索回放失败: ' + key);
        e.code = 'LBL_STAGE_FAIL';
        e.stage = 'cross';
        throw e;
      }
      return;
    }
  }
  const e = new Error('十字棱求解搜索失败: ' + key);
  e.code = 'LBL_STAGE_FAIL';
  e.stage = 'cross';
  throw e;
}

// ---------------------------------------------------------------------------
// 阶段 2：第一层角块（弹出 → 转到目标上方 → SEXY 试探插入）
// ---------------------------------------------------------------------------
function cornerSolved(pa, slotIdx) {
  return pa.cp[slotIdx] === slotIdx && pa.co[slotIdx] === 0;
}

function dbg() {
  if (typeof globalThis !== 'undefined' && globalThis.LBL_DEBUG) {
    console.error.apply(console, arguments);
  }
}

function solveOneCorner(s, slotIdx, solvedList) {
  const slot = CORNERS[slotIdx];
  dbg('[corner] begin', slot.solvedColors.join(''), 'state-firstLayer?', isFirstLayer(s.st));

  let pa = s.pa;
  if (cornerSolved(pa, slotIdx)) return;
  solvedList = solvedList || [];

  let cur = pa.cp.indexOf(slotIdx);
  // 在 D 层 → 先弹出
  if (CORNERS[cur].pos[1] === -1) {
    extractTrial(s, slotIdx, cur, solvedList);
  }
  // 旋转 U 到目标槽位正上方
  const abovePos = slot.pos[0] + ',1,' + slot.pos[2];
  const aboveSlot = CORNERS.findIndex((c) => c.pos.join(',') === abovePos);
  for (let k = 0; k < 4; k++) {
    pa = s.pa;
    cur = pa.cp.indexOf(slotIdx);
    if (cur === aboveSlot) break;
    s.push('U');
  }
  pa = s.pa;
  cur = pa.cp.indexOf(slotIdx);
  if (cur !== aboveSlot) {
    const e = new Error('角块未能转到目标上方: ' + slot.solvedColors.join(''));
    e.code = 'LBL_STAGE_FAIL';
    e.stage = 'corners';
    throw e;
  }
  // SEXY 试探（k = 对称重标记，rep = 重复次数）
  for (let k = 0; k < 4; k++) {
    const seq = relabel(SEXY, k);
    for (let rep = 1; rep <= 6; rep++) {
      const snap = s.snapshot();
      for (let r = 0; r < rep; r++) s.pushSeq(seq);
      const paOk = s.pa;
      const ok =
        cornerSolved(paOk, slotIdx) &&
        isDCross(s.st) &&
        solvedList.every((ci) => cornerSolved(paOk, ci));
      if (ok) {
        dbg('[corner] inserted', slot.solvedColors.join(''), 'k=', k, 'rep=', rep, 'firstLayer?', isFirstLayer(s.st));
        return;
      }
      s.rollback(snap);
    }
  }
  const e = new Error('角块插入失败: ' + slot.solvedColors.join(''));
  e.code = 'LBL_STAGE_FAIL';
  e.stage = 'corners';
  throw e;
}

function extractTrial(s, slotIdx, curSlot, solvedList) {
  void curSlot;
  solvedList = solvedList || [];
  for (let k = 0; k < 4; k++) {
    const seq = relabel(EXTRACT, k);
    const snap = s.snapshot();
    s.pushSeq(seq);
    // 成功条件：目标块离开 D 层 且 十字与已完成角块未破坏
    const pieceNow = s.pa.cp.indexOf(slotIdx);
    const paOk = s.pa;
    if (
      CORNERS[pieceNow].pos[1] === 1 &&
      isDCross(s.st) &&
      solvedList.every((ci) => cornerSolved(paOk, ci))
    ) {
      return;
    }
    s.rollback(snap);
  }
  const e = new Error('角块弹出失败');
  e.code = 'LBL_STAGE_FAIL';
  e.stage = 'corners';
  throw e;
}

// ---------------------------------------------------------------------------
// 阶段 3：第二层棱块（弹出 → 对齐 → 左/右插入）
// ---------------------------------------------------------------------------
function middleOk(s, slotIdx, solvedList) {
  const pa = s.pa;
  return (
    pa.ep[slotIdx] === slotIdx &&
    pa.eo[slotIdx] === 0 &&
    isFirstLayer(s.st) &&
    solvedList.every((si) => pa.ep[si] === si && pa.eo[si] === 0)
  );
}

function solveOneMiddleEdge(s, slotIdx, solvedList) {
  const pieceColors = EDGES[slotIdx].solvedColors;
  solvedList = solvedList || [];
  let guard = 0;
  while (guard++ < 8) {
    const pa = s.pa;
    if (pa.ep[slotIdx] === slotIdx && pa.eo[slotIdx] === 0) return;
    const cur = pa.ep.indexOf(slotIdx);
    if (EDGES[cur].pos[1] === 0) {
      // 卡在中间层：试探一次插入把它顶出来
      if (!ejectMiddleEdgeTrial(s, cur, slotIdx, solvedList)) {
        const e = new Error('中层棱块弹出失败: ' + pieceColors.join(''));
        e.code = 'LBL_STAGE_FAIL';
        e.stage = 'middle';
        throw e;
      }
      continue;
    }
    // 在 U 层：转到"对齐位"（侧贴纸颜色 === 所贴面的字母），再试探 8 种插入
    let inserted = false;
    for (let u = 0; u < 4 && !inserted; u++) {
      const pa2 = s.pa;
      const c = pa2.ep.indexOf(slotIdx);
      const eSlot = EDGES[c];
      const aligned = s.st[eSlot.facelets[1]] === FACE_OF_NORMAL[eSlot.normals[1].join(',')];
      if (aligned) {
        for (let k = 0; k < 4 && !inserted; k++) {
          const algSet = [RIGHT_INSERT, LEFT_INSERT];
          for (const base of algSet) {
            const snap = s.snapshot();
            s.pushSeq(relabel(base, k));
            if (middleOk(s, slotIdx, solvedList)) {
              inserted = true;
              break;
            }
            s.rollback(snap);
          }
        }
      }
      if (!inserted) s.push('U');
    }
    if (!inserted) {
      const e = new Error('中层棱块插入失败: ' + pieceColors.join(''));
      e.code = 'LBL_STAGE_FAIL';
      e.stage = 'middle';
      throw e;
    }
  }
  const e = new Error('中层棱块求解超限: ' + pieceColors.join(''));
  e.code = 'LBL_STAGE_FAIL';
  e.stage = 'middle';
  throw e;
}

function ejectMiddleEdgeTrial(s, stuckSlot, freedPieceId, solvedList) {
  for (let k = 0; k < 4; k++) {
    for (const base of [RIGHT_INSERT, LEFT_INSERT]) {
      const snap = s.snapshot();
      s.pushSeq(relabel(base, k));
      const pa = s.pa;
      // 成功：原卡住的块被顶到 U 层，第一层与已完成棱块未破坏
      if (
        EDGES[pa.ep.indexOf(freedPieceId)].pos[1] === 1 &&
        isFirstLayer(s.st) &&
        solvedList.every((si) => pa.ep[si] === si && pa.eo[si] === 0)
      ) {
        return true;
      }
      s.rollback(snap);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 阶段 4：顶层十字
// ---------------------------------------------------------------------------
function uEdgeOrientedSlots(st) {
  const set = new Set();
  UEDGE_SLOTS.forEach((slotIdx) => {
    const e = EDGES[slotIdx];
    if (st[e.facelets[0]] === 'U') set.add(slotIdx);
  });
  return set;
}
function findURotationFor(s, wantSet) {
  for (let k = 0; k < 4; k++) {
    const snap = s.snapshot();
    for (let i = 0; i < k; i++) s.push('U');
    const cur = uEdgeOrientedSlots(s.st);
    const key = Array.from(cur).sort().join(',');
    const want = Array.from(wantSet).sort().join(',');
    s.rollback(snap);
    if (key === want) return k;
  }
  return -1;
}

function solveUCross(s) {
  const UF = EDGE_SLOT.get('UF');
  const UB = EDGE_SLOT.get('UB');
  const UR = EDGE_SLOT.get('UR');
  const UL = EDGE_SLOT.get('UL');
  let guard = 0;
  while (!isUCross(s.st) && guard++ < 6) {
    const cur = uEdgeOrientedSlots(s.st);
    let k = -1;
    if (cur.size === 2) {
      const arr = Array.from(cur);
      const isOpposite =
        (arr.includes(UF) && arr.includes(UB)) || (arr.includes(UR) && arr.includes(UL));
      if (isOpposite) {
        k = findURotationFor(s, new Set([UR, UL])); // 一字横放
      } else {
        k = findURotationFor(s, new Set([UB, UL])); // L 形放 9 点方向
      }
    }
    for (let i = 0; i < (k > 0 ? k : 0); i++) s.push('U');
    s.pushSeq(OLL_EDGE);
  }
}

// ---------------------------------------------------------------------------
// 阶段 5：顶面同色（Sune/反 Sune 宏搜索 —— 27 种 OLL 角块朝向，深度 ≤5 必然覆盖）
// ---------------------------------------------------------------------------
function solveUFace(s) {
  // 标准 2-Look OLL 角翻色 7 式（含 Sune/反小鱼 + 公式库中已验证的 5 条），
  // 让搜索优先命中"单条公式"解，避免多条小鱼叠加导致步数偏长
  const extra = [];
  try {
    ['oll-h', 'oll-pi', 'oll-t', 'oll-u', 'oll-l'].forEach((id) => {
      const alg = lib.OLL_2LOOK.find((a) => a.id === id);
      if (alg) extra.push(alg.moves);
    });
  } catch (e) {
    // 公式库不可用时退回原宏集
  }
  const macros = [['U'], ['U2'], ["U'"], SUNE, ANTISUNE].concat(extra);
  const pred = (st) => isUFace(st) && isUCross(st) && isTwoLayers(st);
  if (!macroSearch(s, macros, pred, 5)) {
    const e = new Error('顶面翻色失败');
    e.code = 'LBL_STAGE_FAIL';
    e.stage = 'uface';
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 阶段 6/7：顶层置换（宏搜索：U + 重标记 PLL）
// ---------------------------------------------------------------------------
function macroSearch(s, macros, pred, maxDepth) {
  function dfs(depth) {
    if (pred(s.st)) return true;
    if (depth === maxDepth) return false;
    for (const m of macros) {
      const snap = s.snapshot();
      s.pushSeq(m);
      if (dfs(depth + 1)) return true;
      s.rollback(snap);
    }
    return false;
  }
  return dfs(0);
}

function solveTopCorners(s) {
  const macros = [['U'], ["U'"], ['U2']];
  for (let k = 0; k < 4; k++) {
    macros.push(relabel(CORNER_PERM_A, k));
    macros.push(relabel(CORNER_PERM_B, k));
  }
  const pred = (st) => topCornersPermuted(st) && isUFace(st) && isTwoLayers(st);
  if (!macroSearch(s, macros, pred, 4)) {
    const e = new Error('顶层角块归位失败');
    e.code = 'LBL_STAGE_FAIL';
    e.stage = 'uperm-corners';
    throw e;
  }
}

function solveTopEdges(s) {
  const macros = [];
  for (let k = 0; k < 4; k++) {
    macros.push(relabel(EDGE_PERM_A, k));
    macros.push(relabel(EDGE_PERM_B, k));
  }
  const pred = (st) => topEdgesPermuted(st) && topCornersPermuted(st);
  if (!macroSearch(s, macros, pred, 3)) {
    const e = new Error('顶层棱块归位失败');
    e.code = 'LBL_STAGE_FAIL';
    e.stage = 'uperm-edges';
    throw e;
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
const STAGE_DEFS = [
  { id: 'cross', title: '底层十字', hint: '先把底层的四个棱块转回家' },
  { id: 'corners', title: '第一层角块', hint: '把带白色的角块一个个塞进底层' },
  { id: 'middle', title: '第二层棱块', hint: '把四个中层棱块送回中间层' },
  { id: 'ucross', title: '顶层十字', hint: '让顶面出现一个十字' },
  { id: 'uface', title: '顶面同色', hint: '把顶面的角块都翻成同色朝上' },
  { id: 'uperm-corners', title: '顶层角块归位', hint: '让顶层角块的侧面颜色对齐' },
  { id: 'uperm-edges', title: '顶层棱块归位', hint: '最后一步，转好顶层的棱块' }
];

function solveLbl(facelet) {
  const s = new LblSession(facelet);
  STAGE_DEFS.forEach((d) => s.beginStage(d.id, d.title, d.hint));

  // ---- 阶段 1：底层十字（构造式 + 受保护搜索兜底；一旦完成不再被破坏） ----
  const crossKeys = ['DF', 'DR', 'DB', 'DL'];
  const crossIds = crossKeys.map((k) => EDGE_SLOT.get(k));
  for (let round = 0; round < 6 && !isDCross(s.st); round++) {
    crossKeys.forEach((key) => {
      const pieceId = EDGE_SLOT.get(key);
      if (edgeSlotSolved(s.st, pieceId)) return;
      const protectedSlots = crossIds.filter((id2) => id2 !== pieceId && edgeSlotSolved(s.st, id2));
      if (!crossEdgeConstructive(s, pieceId, protectedSlots)) {
        solveCrossEdgeSearch(s, key, protectedSlots);
      }
      // 断言：此前完成的棱仍未破坏
      protectedSlots.forEach((pi) => {
        if (!edgeSlotSolved(s.st, pi)) fail('cross', '十字棱被破坏: ' + EDGES[pi].solvedColors.join(''));
      });
    });
  }
  if (!isDCross(s.st)) fail('cross', '底层十字校验失败');
  s.stages[0].moves = s.moves.slice(s.stages[0].from);
  s.stages[1].from = s.moves.length;

  // ---- 阶段 2：第一层角块 ----
  const solvedCorners = [];
  ['DFR', 'DRB', 'DBL', 'DLF'].forEach((key) => {
    const idx = CORNER_SLOT.get(key);
    solveOneCorner(s, idx, solvedCorners);
    solvedCorners.push(idx);
    // 断言：此前完成的角块仍然归位
    const paNow = s.pa;
    solvedCorners.forEach((ci) => {
      if (!cornerSolved(paNow, ci)) {
        fail('corners', '后续操作破坏了已完成角块: ' + CORNERS[ci].solvedColors.join(''));
      }
    });
  });
  if (!isFirstLayer(s.st)) fail('corners', '第一层校验失败');
  s.stages[1].moves = s.moves.slice(s.stages[1].from);
  s.stages[2].from = s.moves.length;

  // ---- 阶段 3：第二层棱块 ----
  const solvedMiddle = [];
  EDGES.forEach((e, i) => {
    if (e.pos[1] !== 0) return;
    solveOneMiddleEdge(s, i, solvedMiddle);
    solvedMiddle.push(i);
    const paNow = s.pa;
    dbg('[middle] done', EDGES[i].solvedColors.join(''), '| ep', paNow.ep.join(','), '| eo', paNow.eo.join(','),
      '| F-row1:', [21, 22, 23].map((x) => s.st[x]).join(''), 'R-row1:', [12, 13, 14].map((x) => s.st[x]).join(''),
      'L-row1:', [39, 40, 41].map((x) => s.st[x]).join(''), 'B-row1:', [48, 49, 50].map((x) => s.st[x]).join(''));
    solvedMiddle.forEach((si) => {
      if (!(paNow.ep[si] === si && paNow.eo[si] === 0)) {
        fail('middle', '后续操作破坏了已完成棱块: ' + EDGES[si].solvedColors.join(''));
      }
    });
  });
  if (!isTwoLayers(s.st)) fail('middle', '第二层校验失败');
  s.stages[2].moves = s.moves.slice(s.stages[2].from);
  s.stages[3].from = s.moves.length;

  // ---- 阶段 4：顶层十字 ----
  solveUCross(s);
  if (!isUCross(s.st)) fail('ucross', '顶层十字校验失败');
  s.stages[3].moves = s.moves.slice(s.stages[3].from);
  s.stages[4].from = s.moves.length;

  // ---- 阶段 5：顶面同色 ----
  solveUFace(s);
  if (!isUFace(s.st)) fail('uface', '顶面同色校验失败');
  s.stages[4].moves = s.moves.slice(s.stages[4].from);
  s.stages[5].from = s.moves.length;

  // ---- 阶段 6：顶层角块归位 ----
  solveTopCorners(s);
  if (!topCornersPermuted(s.st)) fail('uperm-corners', '顶层角块归位校验失败');
  s.stages[5].moves = s.moves.slice(s.stages[5].from);
  s.stages[6].from = s.moves.length;

  // ---- 阶段 7：顶层棱块归位 ----
  solveTopEdges(s);
  if (s.cube.getFacelet() !== SOLVED) {
    // 末态兜底对齐
    for (let k = 0; k < 4 && s.cube.getFacelet() !== SOLVED; k++) s.push('U');
  }
  if (s.cube.getFacelet() !== SOLVED) {
    const e = new Error('LBL 求解末态校验失败');
    e.code = 'LBL_FINAL_FAIL';
    throw e;
  }
  s.stages[6].moves = s.moves.slice(s.stages[6].from);

  const simp = moveOpt.optimizeStages(facelet, s.moves, s.stages);
  return { moves: simp.moves, stages: simp.stages };
}

function fail(stage, message) {
  const e = new Error(message);
  e.code = 'LBL_STAGE_FAIL';
  e.stage = stage;
  throw e;
}

// ---------------------------------------------------------------------------
// 阶段级导出（供 CFOP / 进阶解法组合复用同一套已验证实现）
// ---------------------------------------------------------------------------

// 仅求解底层十字
function solveCrossOnly(facelet) {
  const s = new LblSession(facelet);
  const crossKeys = ['DF', 'DR', 'DB', 'DL'];
  const crossIds = crossKeys.map((k) => EDGE_SLOT.get(k));
  for (let round = 0; round < 6 && !isDCross(s.st); round++) {
    crossKeys.forEach((key) => {
      const pieceId = EDGE_SLOT.get(key);
      if (edgeSlotSolved(s.st, pieceId)) return;
      const protectedSlots = crossIds.filter((id2) => id2 !== pieceId && edgeSlotSolved(s.st, id2));
      if (!crossEdgeConstructive(s, pieceId, protectedSlots)) {
        solveCrossEdgeSearch(s, key, protectedSlots);
      }
    });
  }
  if (!isDCross(s.st)) fail('cross', '底层十字校验失败');
  return { moves: s.moves };
}

// 仅求解两步式 OLL（顶层十字 + 顶面同色）
function solveOLL2Look(facelet) {
  const s = new LblSession(facelet);
  s.beginStage('ucross', '顶层十字（2-Look OLL ①）', 'F R U R\' U\' F\'：拐角放左上、一字横放');
  solveUCross(s);
  if (!isUCross(s.st)) fail('ucross', '顶层十字校验失败');
  s.stages[0].moves = s.moves.slice(s.stages[0].from);
  s.beginStage('uface', '顶面同色（2-Look OLL ②）', '小鱼公式：R U R\' U R U2 R\'');
  solveUFace(s);
  if (!isUFace(s.st)) fail('uface', '顶面同色校验失败');
  s.stages[1].moves = s.moves.slice(s.stages[1].from);
  return { moves: s.moves, stages: s.stages };
}

// 仅求解两步式 PLL（角块归位 + 棱块归位）
function solvePLL2Look(facelet) {
  const s = new LblSession(facelet);
  s.beginStage('uperm-corners', '角块归位（2-Look PLL ①）', '角块三循环公式');
  solveTopCorners(s);
  if (!topCornersPermuted(s.st)) fail('uperm-corners', '顶层角块归位校验失败');
  s.stages[0].moves = s.moves.slice(s.stages[0].from);
  s.beginStage('uperm-edges', '棱块归位（2-Look PLL ②）', '棱块三循环公式');
  solveTopEdges(s);
  if (s.cube.getFacelet() !== SOLVED) {
    for (let k = 0; k < 4 && s.cube.getFacelet() !== SOLVED; k++) s.push('U');
  }
  if (s.cube.getFacelet() !== SOLVED) {
    const e = new Error('两步式 PLL 末态校验失败');
    e.code = 'LBL_FINAL_FAIL';
    throw e;
  }
  s.stages[1].moves = s.moves.slice(s.stages[1].from);
  return { moves: s.moves, stages: s.stages };
}

const __dbg = { LblSession, EDGE_SLOT, CORNER_SLOT, relabel, SEXY, solveOneCorner, isDCross, isFirstLayer, extractTrial, crossEdgeConstructive, solveCrossEdgeSearch, isTwoLayers };

export { solveLbl, solveCrossOnly, solveOLL2Look, solvePLL2Look, solveUCross, __dbg };
