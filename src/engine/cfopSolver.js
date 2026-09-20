/**
 * cfopSolver.js —— CFOP 解法（Cross → F2L → OLL → PLL）
 *
 * - Cross：工具箱逐棱 BFS（每条棱取最短解）；2-Look OLL：复用 lblSolver 已验证实现
 * - PLL：默认用公式库一步识别（覆盖全部 288 种顶层状态，单条公式 ~11-16 步）
 * - F2L（前两层棱角对）：本模块新实现 —— 定位 → 弹出到顶层 → 配对插入
 *   （构造式 + 受限宏搜索，每组独立验证，不破坏已完成部分）
 * - 进阶（oneLookPLL）：OLL 后用公式库 + AUF 搜索「识别当前 PLL 情形并一步到位」，
 *   公式库经程序验证覆盖全部 288 种顶层状态（见 test/features.test.js）
 *
 * 输出 stages 带标题/口诀/公式，供页面按阶段展示与逐步演示。
 * 不依赖 wx / DOM，可在 Node 中通用。
 */



import { PLL } from './config/algLibrary.js';
import { Cube, SOLVED, invertSequence } from './cube.js';
import { CORNERS, EDGES, pieceArrays } from './cubies.js';
import * as lbl from './lblSolver.js';
import * as moveOpt from './moveOpt.js';
import * as P from './pieceSolver.js';
import * as zbll from './zbll.js';
const SIDE_CYCLE = ['F', 'R', 'B', 'L'];

// ---- 槽位与 F2L 棱角对（按几何位置程序化配对，避免手抄键名出错）----
const F2L_PAIRS = (() => {
  const names = { '1,-1,1': '右前', '1,-1,-1': '右后', '-1,-1,-1': '左后', '-1,-1,1': '左前' };
  const out = [];
  CORNERS.forEach((c, ci) => {
    if (c.pos[1] !== -1) return;
    EDGES.forEach((e, ei) => {
      if (e.pos[1] !== 0) return;
      if (e.pos[0] === c.pos[0] && e.pos[2] === c.pos[2]) {
        out.push({ corner: ci, edge: ei, name: names[c.pos.join(',')], pos: c.pos });
      }
    });
  });
  return out;
})();

function mapFace(f, k) {
  const i = SIDE_CYCLE.indexOf(f);
  return i < 0 ? f : SIDE_CYCLE[(i + k) % 4];
}
function relabel(seq, k) {
  return seq.map((m) => mapFace(m[0], k) + m.slice(1));
}
// 槽位对应的对称偏移：槽位两侧面正好是 (F,R) 的循环平移
function kForSlot(pos) {
  const faces = [];
  if (pos[0] === 1) faces.push('R');
  if (pos[0] === -1) faces.push('L');
  if (pos[2] === 1) faces.push('F');
  if (pos[2] === -1) faces.push('B');
  for (let k = 0; k < 4; k++) {
    const a = mapFace('F', k);
    const b = mapFace('R', k);
    if (faces.indexOf(a) >= 0 && faces.indexOf(b) >= 0) return k;
  }
  return 0;
}

const U_MOVES = [['U'], ["U'"], ['U2']];
const SEXY = ['R', 'U', "R'", "U'"];
const SLEDGE = ["R'", 'F', 'R', "F'"];
const RIGHT_INSERT = ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'];
const LEFT_INSERT = ["U'", "F'", 'U', 'F', 'U', 'R', "U'", "R'"];

class CfoSession {
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
}

// ---- 不变量：十字 + 已完成的 F2L 对保持 ----
const CROSS_KEYS = ['DF', 'DR', 'DB', 'DL'];
function crossEdgeIds() {
  return CROSS_KEYS.map((k) => EDGES.findIndex((e) => e.solvedColors.join('') === k));
}
const CROSS_IDS = crossEdgeIds();

function invariantsOk(pa, solvedPairs) {
  for (const id of CROSS_IDS) {
    if (!(pa.ep[id] === id && pa.eo[id] === 0)) return false;
  }
  for (const p of solvedPairs) {
    if (!(pa.cp[p.corner] === p.corner && pa.co[p.corner] === 0)) return false;
    if (!(pa.ep[p.edge] === p.edge && pa.eo[p.edge] === 0)) return false;
  }
  return true;
}

function pairSolved(pa, pair) {
  return (
    pa.cp[pair.corner] === pair.corner &&
    pa.co[pair.corner] === 0 &&
    pa.ep[pair.edge] === pair.edge &&
    pa.eo[pair.edge] === 0
  );
}

// ---- 弹出：把 D 层角块 / 中层棱块送回 U 层（试探 + 验证）----
function extractCornerToU(s, cornerIdx, solvedPairs) {
  const k = kForSlot(CORNERS[cornerIdx].pos);
  const candidates = [relabel(EXTRACT_BASE, k), relabel(SEXY, k), relabel(SEXY, (k + 1) % 4), relabel(SLEDGE, k)];
  for (const seq of candidates) {
    const snap = s.snapshot();
    s.pushSeq(seq);
    const pa = s.pa;
    const now = pa.cp.indexOf(cornerIdx);
    if (CORNERS[now].pos[1] === 1 && invariantsOk(pa, solvedPairs)) return;
    s.rollback(snap);
  }
  // 再试一遍完整枚举（k 全量）
  for (let kk = 0; kk < 4; kk++) {
    for (const base of [EXTRACT_BASE, SEXY, SLEDGE]) {
      const snap = s.snapshot();
      s.pushSeq(relabel(base, kk));
      const pa = s.pa;
      const now = pa.cp.indexOf(cornerIdx);
      if (CORNERS[now].pos[1] === 1 && invariantsOk(pa, solvedPairs)) return;
      s.rollback(snap);
    }
  }
  const e = new Error('F2L 角块弹出失败');
  e.code = 'CFOP_F2L_FAIL';
  throw e;
}
const EXTRACT_BASE = ['R', 'U', "R'"];

function extractEdgeToU(s, edgeIdx, solvedPairs) {
  const k = kForSlot(EDGES[edgeIdx].pos);
  const candidates = [relabel(EXTRACT_BASE, k), relabel(EXTRACT_BASE, (k + 1) % 4), relabel(RIGHT_INSERT, k), relabel(LEFT_INSERT, k), relabel(SLEDGE, k), relabel(SLEDGE, (k + 1) % 4)];
  for (const seq of candidates) {
    const snap = s.snapshot();
    s.pushSeq(seq);
    const pa = s.pa;
    const now = pa.ep.indexOf(edgeIdx);
    if (EDGES[now].pos[1] === 1 && invariantsOk(pa, solvedPairs)) return;
    s.rollback(snap);
  }
  for (let kk = 0; kk < 4; kk++) {
    for (const base of [EXTRACT_BASE, RIGHT_INSERT, LEFT_INSERT, SLEDGE]) {
      const snap = s.snapshot();
      s.pushSeq(relabel(base, kk));
      const pa = s.pa;
      const now = pa.ep.indexOf(edgeIdx);
      if (EDGES[now].pos[1] === 1 && invariantsOk(pa, solvedPairs)) return;
      s.rollback(snap);
    }
  }
  const e = new Error('F2L 棱块弹出失败');
  e.code = 'CFOP_F2L_FAIL';
  throw e;
}

// ---- 配对插入：顶层两件 + 目标槽位宏搜索 ----
function insertPairSearch(s, pair, solvedPairs) {
  const k = kForSlot(pair.pos);
  // 加入 3 步短手法：搜索按"宏个数"迭代加深，含短宏时才更容易命中更短的总步数
  const SHORT3 = [['R', 'U', "R'"], ['R', 'U2', "R'"], ['R', "U'", "R'"]];
  const shortMacros = [];
  SHORT3.forEach((s) => {
    shortMacros.push(relabel(s, k));
    shortMacros.push(invertSequence(relabel(s, k)));
  });
  const macros = U_MOVES.concat(shortMacros, [
    relabel(SEXY, k),
    invertSequence(relabel(SEXY, k)),
    relabel(SLEDGE, k),
    invertSequence(relabel(SLEDGE, k)),
    relabel(RIGHT_INSERT, k),
    relabel(LEFT_INSERT, k)
  ]);
  function dfs(depth, limit) {
    const pa = s.pa;
    if (pairSolved(pa, pair) && invariantsOk(pa, solvedPairs)) return true;
    if (depth === limit) return false;
    for (const m of macros) {
      const snap = s.snapshot();
      s.pushSeq(m);
      if (dfs(depth + 1, limit)) return true;
      s.rollback(snap);
    }
    return false;
  }
  for (let limit = 1; limit <= 6; limit++) {
    if (dfs(0, limit)) return true;
  }
  return false;
}

function solveF2LPair(s, pair, solvedPairs) {
  for (let guard = 0; guard < 12; guard++) {
    const pa = s.pa;
    if (pairSolved(pa, pair) && invariantsOk(pa, solvedPairs)) return;
    const cs = pa.cp.indexOf(pair.corner);
    const es = pa.ep.indexOf(pair.edge);
    // 角块在 D 层但不在自己家 → 弹出
    if (cs !== pair.corner && CORNERS[cs].pos[1] === -1) {
      extractCornerToU(s, pair.corner, solvedPairs);
      continue;
    }
    // 棱块在中层但不在自己位 → 弹出
    if (es !== pair.edge && EDGES[es].pos[1] === 0) {
      extractEdgeToU(s, pair.edge, solvedPairs);
      continue;
    }
    // 两件都在顶层 → 宏搜索配对插入
    if (insertPairSearch(s, pair, solvedPairs)) return;
    const e = new Error('F2L 配对插入失败：' + pair.name);
    e.code = 'CFOP_F2L_FAIL';
    throw e;
  }
  const e = new Error('F2L 求解超限：' + pair.name);
  e.code = 'CFOP_F2L_FAIL';
  throw e;
}

// ---- PLL 一步到位：公式库 + AUF 搜索（识别与求解合一）----
function solvePLLOneLook(s) {
  const algMacros = PLL.map((a) => ({ name: a.name, moves: a.moves }));
  const macros = U_MOVES.map((m) => ({ name: null, moves: m })).concat(algMacros);
  const path = [];
  function dfs(depth, limit) {
    if (s.st === SOLVED) return true;
    if (depth === limit) return false;
    for (const m of macros) {
      const snap = s.snapshot();
      s.pushSeq(m.moves);
      path.push(m);
      if (dfs(depth + 1, limit)) return true;
      path.pop();
      s.rollback(snap);
    }
    return false;
  }
  for (let limit = 1; limit <= 3; limit++) {
    path.length = 0;
    if (dfs(0, limit)) {
      const usedAlgs = path.filter((p) => p.name);
      return {
        moves: s.moves.slice(),
        algNames: usedAlgs.map((p) => p.name),
        oneLook: usedAlgs.length === 1
      };
    }
  }
  return null;
}

/**
 * CFOP 求解
 * @param {string} facelet 54 位状态
 * @param {Object} opts { twoLookPLL: false } —— 默认 PLL 用公式库一步识别；true 时走两步式
 * @returns { moves, stages: [{ id, title, hint, emoji, from, moves }] }
 */
function solveCFOP(facelet, opts) {
  opts = opts || {};
  const s = new CfoSession(facelet);
  const stages = [];
  const begin = (id, title, hint, emoji) => {
    stages.push({ id, title, hint, emoji, from: s.moves.length, moves: [] });
  };
  const end = () => {
    stages[stages.length - 1].moves = s.moves.slice(stages[stages.length - 1].from);
  };

  // 1) Cross：逐条棱用工具箱 BFS（每条棱取最短解，比一次性搜索的"首个解"短很多）
  begin('cross', 'Cross 底层十字', '先把白色十字拼到底面', '✝️');
  const CROSS_IDS = [1, 10, 0, 8]; // DF, DR, DB, DL
  for (const slot of CROSS_IDS) {
    const crossPred = (st) =>
      CROSS_IDS.filter((x) => CROSS_IDS.indexOf(x) < CROSS_IDS.indexOf(slot)).every((x) => P.edgeSolvedAt(st, x));
    if (!P.solveEdgeTo(s, slot, crossPred, { maxPrim: 4 })) {
      // 兜底：回到 LBL 十字（已 2000 例压测）
      const crossRes = lbl.solveCrossOnly(s.st);
      s.pushSeq(crossRes.moves.slice());
      break;
    }
  }
  end();

  // 2) F2L ×4
  const solvedPairs = [];
  F2L_PAIRS.forEach((pair, i) => {
    begin('f2l-' + i, 'F2L 第 ' + (i + 1) + ' 组（' + pair.name + '）', '把角块和棱块配成一对送回家', '🧩');
    solveF2LPair(s, pair, solvedPairs);
    end();
    solvedPairs.push(pair);
  });

  // 3) ZBLL 模式（可选）：先只做"顶层十字（棱翻色）"，再尝试用一条 ZBLL 公式完成整个顶层
  let zbllDone = false;
  if (opts.zbll && s.st !== SOLVED) {
    try {
      const beforeUcross = s.moves.length;
      const shim = {
        cube: s.cube,
        moves: s.moves,
        beginStage(id, title, hint) {
          this._pending = { id, title, hint, from: this.moves.length };
        },
        push(m) {
          this.cube.move(m);
          this.moves.push(m);
        },
        pushSeq(seq) {
          for (let i = 0; i < seq.length; i++) this.push(seq[i]);
        },
        get st() {
          return this.cube.getFacelet();
        },
        get pa() {
          return pieceArrays(this.cube.getFacelet());
        },
        snapshot() {
          return { st: this.cube.getFacelet(), len: this.moves.length };
        },
        rollback(snap) {
          this.cube.setState(snap.st);
          this.moves.length = snap.len;
        }
      };
      lbl.solveUCross(shim);
      const ucMoves = s.moves.slice(beforeUcross);
      if (ucMoves.length) {
        stages.push({
          id: 'ucross',
          title: '顶层十字（棱翻色）',
          hint: "F R U R' U' F'：把顶层 4 条棱翻成十字",
          emoji: '✨',
          from: beforeUcross,
          moves: ucMoves
        });
      }
      const m = zbll.matchZbll(s.st);
      if (m.applicable && m.found) {
        begin('zbll', 'ZBLL 一步顶层（' + (m.name || '') + '）', '棱朝向已好，角翻色 + 角棱归位一条公式完成', '🏆');
        s.pushSeq(m.moves);
        end();
        zbllDone = s.st === SOLVED;
      }
    } catch (e) {
      zbllDone = false;
    }
  }
  if (zbllDone) {
    const simpZ = moveOpt.optimizeStages(facelet, s.moves, stages);
    return { moves: simpZ.moves, stages: simpZ.stages, pllOneLookName: '', zbll: true, solved: true };
  }

  // 3) OLL 两步式
  const oll = lbl.solveOLL2Look(s.st);
  s.pushSeq(oll.moves);
  oll.stages.forEach((st) => {
    stages.push({ id: st.id, title: st.title, hint: st.hint, emoji: st.id === 'ucross' ? '✨' : '🟡', from: s.moves.length - oll.moves.length + st.from, moves: st.moves });
  });

  // 4) PLL：默认用公式库一步识别（比两步式短 ~15 步）；显式传 twoLookPLL 才走两步式
  let pllOneLookName = '';
  if (!opts.twoLookPLL) {
    begin('pll-one', 'PLL 一步到位', '公式库识别当前情形，一条公式搞定顶层', '🏆');
    const r = solvePLLOneLook(s);
    if (r && r.oneLook) {
      pllOneLookName = r.algNames[0] || '';
    } else if (!r) {
      // 极端兜底：退回两步式
      s.rollback({ st: s.st, len: s.moves.length });
      const fallback = lbl.solvePLL2Look(s.st);
      s.pushSeq(fallback.moves);
    }
    end();
  } else {
    const pll = lbl.solvePLL2Look(s.st);
    s.pushSeq(pll.moves);
    pll.stages.forEach((st) => {
      stages.push({ id: st.id, title: st.title, hint: st.hint, emoji: '🎯', from: s.moves.length - pll.moves.length + st.from, moves: st.moves });
    });
  }

  const simp = moveOpt.optimizeStages(facelet, s.moves, stages);
  return { moves: simp.moves, stages: simp.stages, pllOneLookName, solved: s.st === SOLVED };
}

export { solveCFOP, F2L_PAIRS, solvePLLOneLook, CfoSession };
