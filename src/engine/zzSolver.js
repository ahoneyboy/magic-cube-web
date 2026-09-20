/**
 * zzSolver.js —— ZZ 法求解器
 *
 * 阶段：
 *   1) EOLine：先把 12 条棱全部调正（EO），同时归位 DF/DB 两条棱形成"直线"
 *      —— EO 用「朝向掩码」BFS（2^11 状态空间，首个到达即最短）
 *   2) F2L：只用 R/U/L 完成四组棱角对 + DL/DR 两条底棱，全程无需翻棱
 *   3) OCLL：顶层角块翻色（棱块早已朝上，顶面十字自然成立）
 *   4) PLL：顶层归位（复用 LBL 已验证的两步式 PLL）
 *
 * 特点：拧动以 R/U 为主、转体少，适合单手；难点在 EOLine 的观察。
 * 不依赖 wx / DOM，可在 Node 中通用。
 */


import { solvePLLOneLook } from './cfopSolver.js';
import { Cube, SOLVED } from './cube.js';
import { CORNERS, EDGES } from './cubies.js';
import * as lbl from './lblSolver.js';
import * as P from './pieceSolver.js';
import * as zbll from './zbll.js';
const edgeOriented = P.edgeOriented;

const EOLINE_EDGES = [1, 0]; // DF, DB
const ZEO_MASK = '000000000000';
// 保持棱朝向的转动：U/D/R/L（ZZ 铁律；F/B 会翻棱，M 也不行）
const EO_SAFE_EOLINE = ['U', 'D', 'R', 'L'];
const EO_SAFE_F2L = ['U', 'R', 'L'];

// 左右镜像：R↔L、U↔U'（转动方向随镜像反向）
function mirrorSeq(seq) {
  return seq.map((m) => {
    const f = m[0];
    const suf = m.slice(1);
    const flip = suf === "'" ? '' : suf === '2' ? '2' : "'";
    if (f === 'R') return 'L' + flip;
    if (f === 'L') return 'R' + flip;
    if (f === 'U') return 'U' + flip;
    return m;
  });
}

// ZZ-F2L 插入公式（只用 R/U/L，天然不翻棱）
const ZZ_R_ALGS = [
  ['R', 'U', "R'"],
  ['R', 'U2', "R'"],
  ['R', "U'", "R'"],
  ["R'", 'U', 'R'],
  ["R'", "U'", 'R'],
  ["R'", 'U2', 'R'],
  ["U'", 'R', 'U', "R'"],
  ['U', 'R', 'U', "R'"],
  ['U2', 'R', 'U', "R'"],
  ['R', 'U', "R'", 'U', 'R', 'U', "R'"],
  ['R', 'U2', "R'", "U'", 'R', 'U', "R'"],
  ["R'", "U'", 'R', "U'", "R'", 'U', 'R'],
  ['R', "U'", "R'", 'U', 'R', 'U', "R'"],
  ['R', 'U', "R'", "U'", 'R', "U'", "R'"]
];
const ZZ_L_ALGS = ZZ_R_ALGS.map(mirrorSeq);
const R_SLOT_ALGS = ZZ_R_ALGS;
const L_SLOT_ALGS = ZZ_L_ALGS;
const U_MOVES = [['U'], ["U'"], ['U2']];
// ZZ-F2L 允许的转动（R/U/L/D 都保持棱朝向）
const URLD_MOVES = ['U', "U'", 'U2', 'R', "R'", 'R2', 'L', "L'", 'L2', 'D', "D'", 'D2'];

// 弹出候选（把 D 层角块 / 中层棱块送回顶层，同时不破坏已完成部分）
const EXTRACT_CANDS_R = [
  ['R', 'U', "R'"],
  ["R'", "U'", 'R'],
  ["R'", 'U', 'R'],
  ['R', "U'", "R'"],
  ['R', 'U', "R'", "U'"],
  ["R'", "U'", 'R', 'U']
];
const EXTRACT_CANDS_L = EXTRACT_CANDS_R.map(mirrorSeq);

function eoMaskOf(st) {
  let mask = '';
  for (let i = 0; i < 12; i++) mask += edgeOriented(st, i) ? '0' : '1';
  return mask;
}

/** EO 阶段：朝向掩码 BFS（首个到达的掩码即为最短） */
function solveEO(s) {
  const start = s.st;
  if (eoMaskOf(start) === ZEO_MASK) return true;
  const moves = P.ALL_MOVES;
  const seen = new Set([eoMaskOf(start)]);
  let frontier = [{ st: start, parent: null, mv: null }];
  for (let d = 1; d <= 9; d++) {
    const next = [];
    for (const node of frontier) {
      for (const m of moves) {
        const c = new Cube(node.st);
        c.move(m);
        const st = c.getFacelet();
        const mask = eoMaskOf(st);
        if (seen.has(mask)) continue;
        if (mask === ZEO_MASK) {
          const path = [m];
          let p = node;
          while (p && p.mv) {
            path.unshift(p.mv);
            p = p.parent;
          }
          s.pushSeq(path);
          return true;
        }
        seen.add(mask);
        next.push({ st, parent: node, mv: m });
      }
    }
    frontier = next;
  }
  return false;
}

// ---- F2L ----
function zzPairSolved(st, pair) {
  return P.cornerSolvedAt(st, pair.corner) && P.edgeSolvedAt(st, pair.edge);
}
function pieceInU(st, pieceIdx, isCorner) {
  const slot = isCorner ? P.cornerSlotOf(st, pieceIdx) : P.edgeSlotOf(st, pieceIdx);
  if (slot < 0) return false;
  return (isCorner ? CORNERS[slot] : EDGES[slot]).pos[1] === 1;
}
function pieceInDOrMiddle(st, pieceIdx, isCorner) {
  const slot = isCorner ? P.cornerSlotOf(st, pieceIdx) : P.edgeSlotOf(st, pieceIdx);
  if (slot < 0) return false;
  const y = (isCorner ? CORNERS[slot] : EDGES[slot]).pos[1];
  return isCorner ? y === -1 : y === 0;
}

/** 弹出：把块送回顶层，且不破坏已完成的保护部分 */
function extractToU(s, pieceIdx, isCorner, pred) {
  const cands = EXTRACT_CANDS_R.concat(EXTRACT_CANDS_L);
  for (const seq of cands) {
    const snap = s.snapshot();
    s.pushSeq(seq);
    if (pieceInU(s.st, pieceIdx, isCorner) && pred(s.st)) return true;
    s.rollback(snap);
  }
  return false;
}

/**
 * 求解一组 ZZ-F2L 棱角对（只用 R/U/L）
 */
function solveZZPair(s, pair, pred, opts) {
  opts = opts || {};
  const macroSet = (pair.edge === 7 || pair.edge === 6 ? R_SLOT_ALGS : L_SLOT_ALGS).concat(U_MOVES, [
    ['R'],
    ["R'"],
    ['L'],
    ["L'"]
  ]);
  const target = (st) => zzPairSolved(st, pair) && pred(st);
  for (let guard = 0; guard < 24; guard++) {
    if (target(s.st)) return true;
    const cSlot = P.cornerSlotOf(s.st, pair.corner);
    const eSlot = P.edgeSlotOf(s.st, pair.edge);
    if (cSlot < 0 || eSlot < 0) return false;
    if (cSlot !== pair.corner && CORNERS[cSlot].pos[1] === -1) {
      if (extractToU(s, pair.corner, true, pred)) continue;
      return false;
    }
    if (eSlot !== pair.edge && EDGES[eSlot].pos[1] === 0) {
      if (extractToU(s, pair.edge, false, pred)) continue;
      return false;
    }
    // 两件都在顶层：RUL(+D) 受限 BFS。此时前两层大部分已完成，可达状态空间小，
    // BFS 既完备又比宏搜索快得多（深度上限内无解才判定失败）。
    if (P.bfsSolve(s, target, { moves: URLD_MOVES, maxDepth: 10, cap: opts.bfsCap || 100000 })) continue;
    if (P.macroSearch(s, target, macroSet, 4)) continue;
    return false;
  }
  return false;
}

// ---- 主流程 ----
/**
 * ZZ 求解
 * @param {string} facelet 54 位状态
 */
function solveZZ(facelet, opts) {
  opts = opts || {};
  const s = new P.PSession(facelet);
  const stages = [];
  try {
    return solveZZInner(s, stages, opts || {});
  } catch (e) {
    // 任何异常（含意外 TypeError）都走通用收尾，保证一定交出可用解法
    if (e) {
      // 本方法特定阶段在当前状态没求出解：如实标注，剩余部分改用通用手法收尾
      P.finishWithLbl(s, stages, (e.code === 'ADV_TIMEOUT' ? '本方法计算超时' : e.message) + '：剩余部分改用通用手法收尾');
      return { moves: s.moves, stages, solved: s.st === SOLVED, fallback: true };
    }
    throw e;
  }
}

function solveZZInner(s, stages, opts) {
  const begin = (id, title, hint, emoji) => {
    stages.push({ id, title, hint, emoji, from: s.moves.length, moves: [] });
  };
  const end = () => {
    const cur = stages[stages.length - 1];
    cur.moves = s.moves.slice(cur.from);
  };

  const eoOk = (st) => eoMaskOf(st) === ZEO_MASK;
  const lineOk = (st) => P.edgeSolvedAt(st, 1) && P.edgeSolvedAt(st, 0);

  // 1) EOLine
  begin('eo', 'EOLine ① 棱块定向（EO）', '先把 12 条棱的朝向全部调正，位置先不管', '⚡');
  if (!solveEO(s)) throwZZ('EO 定向失败');
  end();

  begin('line', 'EOLine ② 归位 DF·DB', '底线两条棱放好，只用 R/U/L/D', '📏');
  for (const slot of EOLINE_EDGES) {
    if (!P.solveEdgeTo(s, slot, (st) => eoOk(st) && lineOk(st), { allowedFaces: EO_SAFE_EOLINE })) {
      throwZZ('EOLine 归位失败');
    }
  }
  if (!eoOk(s.st) || !lineOk(s.st)) throwZZ('EOLine 校验失败');
  end();

  // 2) 先补 DL/DR 两条底棱，再完成四组棱角对（只用 R/U/L/D，保持棱朝向）
  const DEDGE_MACROS = ZZ_R_ALGS.concat(ZZ_L_ALGS, U_MOVES, [['R'], ["R'"], ['R2'], ['L'], ["L'"], ['L2']]);
  const basePred = (st) => eoOk(st) && lineOk(st);
  begin('f2l-dedges', 'F2L ① DL·DR 两条底棱', '先把底线两条棱放好（R/U/L/D）', '📏');
  for (const slot of [8, 10]) {
    if (!P.solveEdgeTo(s, slot, (st) => basePred(st), { allowedFaces: EO_SAFE_F2L, extraMacros: DEDGE_MACROS, maxPrim: 4 })) {
      throwZZ('F2L 底棱失败');
    }
  }
  end();

  const F2L_PAIRS = [
    { corner: 5, edge: 7, name: '右前' },
    { corner: 4, edge: 6, name: '右后' },
    { corner: 1, edge: 5, name: '左前' },
    { corner: 0, edge: 4, name: '左后' }
  ];
  // 组内顺序不唯一：按"哪组好解先解哪组"的直觉，失败就换一个顺序重来
  const F2L_ORDERS = [
    [0, 1, 2, 3],
    [1, 0, 3, 2],
    [2, 3, 0, 1],
    [3, 2, 1, 0],
    [0, 2, 1, 3],
    [1, 3, 0, 2]
  ];
  const f2lStart = s.snapshot();
  let solvedPairs = [];
  let okAll = false;
  // F2L 阶段子预算：多顺序重试不能把整局预算吃光（后面还有顶层）
  const f2lDeadline = Date.now() + (opts && opts.f2lBudgetMs ? opts.f2lBudgetMs : 3000);
  for (const order of F2L_ORDERS) {
    if (Date.now() > f2lDeadline) break;
    if (order !== F2L_ORDERS[0]) s.rollback(f2lStart);
    solvedPairs = [];
    let okRound = true;
    const stagedMoves = [];
    for (const idx of order) {
      const pair = F2L_PAIRS[idx];
      const pred = (st) =>
        basePred(st) &&
        P.edgeSolvedAt(st, 8) &&
        P.edgeSolvedAt(st, 10) &&
        solvedPairs.every((p) => zzPairSolved(st, p));
      const extraMacros = pair.edge === 7 || pair.edge === 6 ? R_SLOT_ALGS : L_SLOT_ALGS;
      let ok = P.solvePairConstructive(s, pair.corner, pair.edge, pred, {
        allowedFaces: EO_SAFE_F2L,
        extraMacros,
        maxPrim: 6,
        plainDepth: 8
      });
      if (!ok) {
        ok = P.solvePairConstructive(s, pair.corner, pair.edge, pred, {
          allowedFaces: EO_SAFE_EOLINE,
          extraMacros,
          maxPrim: 6,
          plainDepth: 8
        });
      }
      if (!ok) {
        okRound = false;
        break;
      }
      solvedPairs.push(pair);
      stagedMoves.push({ pair, from: s.moves.length });
    }
    if (okRound) {
      okAll = true;
      // 记录阶段（按本次成功的顺序）
      let prevFrom = f2lStart.len;
      stagedMoves.forEach((sm, i) => {
        stages.push({
          id: 'f2l-' + i,
          title: 'F2L 第 ' + (i + 1) + ' 组（' + sm.pair.name + '）',
          hint: 'R/U/L 完成棱角对，棱朝向不用再管',
          emoji: '🧩',
          from: prevFrom,
          moves: s.moves.slice(prevFrom, sm.from)
        });
        prevFrom = sm.from;
      });
      break;
    }
  }
  if (!okAll) throwZZ('F2L 四组未能在限定尝试内解出');

  // 3) 顶层：优先 ZBLL（棱朝向已好 → 顶层一步完成）；匹配不到再退"OCLL + PLL"
  let zbllUsed = false;
  try {
    const m = zbll.matchZbll(s.st);
    if (m.applicable && m.found) {
      begin('zbll', 'ZBLL 顶层一步式（' + (m.name || '') + '）', '棱朝向已好，顶层用一个公式全部解决', '🏆');
      s.pushSeq(m.moves);
      end();
      zbllUsed = s.st === SOLVED;
    }
  } catch (e) {
    zbllUsed = false;
  }
  if (zbllUsed) {
    return { moves: s.moves, stages, solved: true, zbll: true };
  }

  // 3) OCLL：顶层角块翻色（顶面十字已自动成立）
  const oll = lbl.solveOLL2Look(s.st);
  s.pushSeq(oll.moves);
  oll.stages.forEach((st) => {
    if (st.moves.length === 0) return; // 棱朝向已好，十字阶段通常为 0 步
    stages.push({
      id: 'ocll-' + st.id,
      title: st.id === 'ucross' ? '顶层棱块翻色' : 'OCLL 顶层角块翻色',
      hint: st.hint,
      emoji: '🟡',
      from: s.moves.length - oll.moves.length + st.from,
      moves: st.moves
    });
  });

  // 4) PLL：优先公式库一步识别（更少公式），失败再退回两步式
  const pllSnap = s.snapshot();
  const beforeLen = s.moves.length;
  let pll = null;
  try {
    const oneLook = solvePLLOneLook(s); // 会直接应用到 session
    if (oneLook && oneLook.algNames && oneLook.algNames.length) {
      const mv = s.moves.slice(beforeLen);
      pll = { moves: mv, stages: [{ id: 'pll-one', title: 'PLL 一步到位（' + (oneLook.algNames[0] || '公式库') + '）', hint: '公式库识别当前情形，一条公式搞定顶层', from: 0, moves: mv }] };
    }
  } catch (e) {
    pll = null;
  }
  if (!pll) {
    // 一步搜索没成功（可能已应用多公式解）→ 回滚后走两步式
    s.rollback(pllSnap);
    pll = lbl.solvePLL2Look(s.st);
    s.pushSeq(pll.moves);
  }
  pll.stages.forEach((st) => {
    stages.push({
      id: st.id === 'pll-one' ? 'zz-pll-one' : 'zz-pll-' + st.id,
      title: st.title,
      hint: st.hint,
      emoji: '🎯',
      from: s.moves.length - pll.moves.length + st.from,
      moves: st.moves
    });
  });

  return { moves: s.moves, stages, solved: s.st === SOLVED, eoOnly: true };
}

function throwZZ(msg) {
  const e = new Error(msg);
  e.code = 'ZZ_FAIL';
  throw e;
}

const ZZ_F2L_MACROS = ZZ_R_ALGS.concat(ZZ_L_ALGS);

export { solveZZ, solveEO, eoMaskOf, zzPairSolved, solveZZPair, ZEO_MASK, EO_SAFE_EOLINE, EO_SAFE_F2L, R_SLOT_ALGS, L_SLOT_ALGS, mirrorSeq, ZZ_F2L_MACROS };
