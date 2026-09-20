/**
 * petrusSolver.js —— Petrus（彼得鲁斯法）求解器
 *
 * 阶段：
 *   1) 2×2×3 块：左下二层搭一个大块（2 角 + 5 棱：DL/FL/BL/DF/DB 与 DBL/DLF）
 *   2) EO 棱块定向：把剩下 7 条棱调正，此后只用 R/U/L
 *   3) 完成前两层：R 层两条底棱 + 两组棱角对（RUL，不再翻棱）
 *   4) 顶层：OLL 两步式 + PLL 两步式（复用 LBL 已验证实现）
 *
 * 特点：块构建自由度高，公式量小；难点在"边搭块边观察"。
 * 不依赖 wx / DOM，可在 Node 中通用。
 */



import { solvePLLOneLook } from './cfopSolver.js';
import { Cube, SOLVED } from './cube.js';
import { CORNERS, EDGES } from './cubies.js';
import * as lbl from './lblSolver.js';
import * as P from './pieceSolver.js';
import { edgeOriented } from './rouxSolver.js';
import * as ZZ from './zzSolver.js';
// 2×2×3 块（x≤0 且 y≤0 的区域）
const BLOCK_EDGES = [8, 5, 4, 1, 0]; // DL, FL, BL, DF, DB
const BLOCK_CORNERS = [0, 1]; // DBL, DLF
const REMAIN_EDGES = [11, 7, 10, 6, 9, 3, 2]; // UR, FR, DR, BR, UL, UF, UB

/**
 * Petrus EO 判据：剩下 7 条棱"可以用 R/U/L 解决"的朝向条件
 *  - 含 U/D 色 → 该色必须在 U/D 面上
 *  - 不含（FR/BR）→ F/B 色必须在 F/B 面上
 * 该判据下 R/U 转动可以改变朝向 —— 这正是 Petrus EO 步骤存在的意义。
 */
function petrusEdgeGood(st, slot) {
  const e = EDGES[slot];
  const c0 = st[e.facelets[0]];
  const c1 = st[e.facelets[1]];
  const hasUD = c0 === 'U' || c0 === 'D' || c1 === 'U' || c1 === 'D';
  if (hasUD) return c0 === 'U' || c0 === 'D';
  return c0 === 'F' || c0 === 'B';
}
function remainEdgesGood(st) {
  for (let i = 0; i < 12; i++) {
    if (BLOCK_EDGES.indexOf(i) >= 0) continue;
    if (!petrusEdgeGood(st, i)) return false;
  }
  return true;
}

// EO 宏：单步 R/U(/L) + 常用手序，粒度细、便于组合
const EO_MACROS_RU = [['R'], ["R'"], ['R2'], ['U'], ["U'"], ['U2'], P.SEXY, P.EXTRACT];
const EO_MACROS_RUL = EO_MACROS_RU.concat([['L'], ["L'"], ['L2']]);

/**
 * Petrus 求解
 */
function solvePetrus(facelet) {
  const s = new P.PSession(facelet);
  const stages = [];
  try {
    return solvePetrusInner(s, stages);
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

function solvePetrusInner(s, stages) {
  const begin = (id, title, hint, emoji) => {
    stages.push({ id, title, hint, emoji, from: s.moves.length, moves: [] });
  };
  const end = () => {
    const cur = stages[stages.length - 1];
    cur.moves = s.moves.slice(cur.from);
  };
  const blockOk = (st) => P.blockPred(BLOCK_EDGES, BLOCK_CORNERS)(st);

  // 1) 2×2×3 块（2 角 + 5 棱一起构建，卡住时自动扰动重试）
  begin('block223', '2×2×3 大块', '左下角先搭一个 2×2×3：两个角 + 五条棱', '🧱');
  const BLOCK_ORDER = [
    { type: 'e', idx: 8 },
    { type: 'c', idx: 0 },
    { type: 'c', idx: 1 },
    { type: 'e', idx: 4 },
    { type: 'e', idx: 5 },
    { type: 'e', idx: 1 },
    { type: 'e', idx: 0 }
  ];
  if (!P.solveBlockPieces(s, [8, 5, 4, 1, 0], [0, 1], () => true, { retries: 80, order: BLOCK_ORDER })) {
    throwPetrus('2×2×3 块构建失败');
  }
  if (!blockOk(s.st)) throwPetrus('2×2×3 块校验失败');
  end();

  // 2) EO：剩下 7 条棱定向（优先只用 R/U，必要时允许 L，最后才放开全部转动）
  begin('eo', '棱块定向（EO）', '把剩下 7 条棱朝向调正，之后只用 R/U/L', '⚡');
  const eoGoal = (st) => blockOk(st) && remainEdgesGood(st);
  let eoOkDone = false;
  const attempts = [
    { macros: EO_MACROS_RU, depth: 6 },
    { macros: EO_MACROS_RUL, depth: 6 },
    { macros: P.FULL_MACROS.concat([['R'], ["R'"], ['L'], ["L'"], ['F'], ["F'"], ['B'], ["B'"]]), depth: 4 }
  ];
  for (const att of attempts) {
    if (P.macroSearch(s, eoGoal, att.macros, att.depth)) {
      eoOkDone = true;
      break;
    }
  }
  if (!eoOkDone) throwPetrus('EO 定向失败');
  end();

  // 3) 完成前两层（RUL，保朝向）
  const EO_SAFE = ['U', 'R', 'L'];
  const eoKeep = (st) => blockOk(st) && remainEdgesGood(st);
  begin('dedge', '完成前两层 ① DR 底棱', 'R 层的底棱回家', '🧩');
  if (!P.solveEdgeTo(s, 10, eoKeep, { allowedFaces: EO_SAFE, extraMacros: ZZ.ZZ_F2L_MACROS, maxPrim: 4 })) {
    throwPetrus('DR 底棱失败');
  }
  end();
  const drGuard = (st) => eoKeep(st) && P.edgeSolvedAt(st, 10);

  const pairs = [
    { corner: 5, edge: 7, name: '右前' },
    { corner: 4, edge: 6, name: '右后' }
  ];
  const solvedPairs = [];
  pairs.forEach((pair, i) => {
    begin('f2l-' + i, '完成前两层 ② 第 ' + (i + 1) + ' 组（' + pair.name + '）', 'R/U/L 把棱角对送回家', '🧩');
    const pred = (st) => drGuard(st) && solvedPairs.every((p) => ZZ.zzPairSolved(st, p));
    if (!ZZ.solveZZPair(s, pair, pred)) throwPetrus('前两层第 ' + (i + 1) + ' 组失败');
    solvedPairs.push(pair);
    end();
  });

  // 4) 顶层：OLL 两步式 + PLL 两步式（复用已验证实现）
  const oll = lbl.solveOLL2Look(s.st);
  s.pushSeq(oll.moves);
  oll.stages.forEach((st) => {
    stages.push({
      id: 'petrus-oll-' + st.id,
      title: st.id === 'ucross' ? '顶层十字（2-Look OLL ①）' : '顶面同色（2-Look OLL ②）',
      hint: st.hint,
      emoji: '🟡',
      from: s.moves.length - oll.moves.length + st.from,
      moves: st.moves
    });
  });
  const pllSnap = s.snapshot();
  const beforeLen = s.moves.length;
  let pll = null;
  try {
    const oneLook = solvePLLOneLook(s); // 会直接应用到 session
    if (oneLook && oneLook.algNames && oneLook.algNames.length) {
      const mv = s.moves.slice(beforeLen);
      pll = { moves: mv, stages: [{ id: 'pll-one', title: 'PLL 一步到位（' + (oneLook.algNames[0] || '公式库') + '）', hint: '公式库识别情形，一条公式搞定顶层', from: 0, moves: mv }] };
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
      id: st.id === 'pll-one' ? 'petrus-pll-one' : 'petrus-pll-' + st.id,
      title: st.title,
      hint: st.hint,
      emoji: '🎯',
      from: s.moves.length - pll.moves.length + st.from,
      moves: st.moves
    });
  });

  return { moves: s.moves, stages, solved: s.st === SOLVED };
}

function throwPetrus(msg) {
  const e = new Error(msg);
  e.code = 'PETRUS_FAIL';
  throw e;
}

export { solvePetrus, petrusEdgeGood, remainEdgesGood, BLOCK_EDGES, BLOCK_CORNERS, REMAIN_EDGES };
