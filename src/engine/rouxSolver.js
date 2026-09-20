/**
 * rouxSolver.js —— 桥式法（Roux）求解器
 *
 * 阶段：
 *   1) FB 左桥：左侧 1×2×3 块（DL/BL/FL 棱 + DBL/DLF 角）
 *   2) SB 右桥：右侧 1×2×3 块（DR/BR/FR 棱 + DRB/DFR 角）
 *   3) CMLL：顶层四角一次性归位（公式库搜索：Sune/反小鱼/Aa/Ab/T/Y + AUF）
 *   4) LSE：最后六棱（M/U 双层搜索，分 4a 翻棱 / 4b 归位 UL·UR / 4c 收尾）
 *
 * 优点体现：全程不破坏已完成的桥；LSE 只用 M/U，转动幅度小，适合单手。
 * 不依赖 wx / DOM，可在 Node 中通用。
 */



import { Cube, FACES, SOLVED } from './cube.js';
import { CORNERS, EDGES } from './cubies.js';
import * as P from './pieceSolver.js';
// 槽位（与 cubies.js 表一致）
const FB_EDGES = [8, 4, 5]; // DL, BL, FL
const FB_CORNERS = [0, 1]; // DBL, DLF
const SB_EDGES = [10, 6, 7]; // DR, BR, FR
const SB_CORNERS = [4, 5]; // DRB, DFR
const LSE_SLOTS = [3, 2, 9, 11, 1, 0]; // UF, UB, UL, UR, DF, DB

const SUNE = ['R', 'U', "R'", 'U', 'R', 'U2', "R'"];
const ANTISUNE = ['R', 'U2', "R'", "U'", 'R', "U'", "R'"];
const AA = ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'];
const AB = ['R2', 'B2', 'R', 'F', "R'", 'B2', 'R', "F'", 'R'];
const T_PERM = ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"];
const Y_PERM = ['F', 'R', "U'", "R'", "U'", 'R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"];

const CMLL_MACROS = P.U_ALL.concat([SUNE, ANTISUNE, AA, AB, T_PERM, Y_PERM]);

const M_ALL = [['M'], ["M'"], ['M2']];
const U_ALL = P.U_ALL;
const MU = M_ALL.concat(U_ALL);
const M2U2 = [['M2'], ['U2']];
const M2U2U = [['M2'], ['U2'], ['U'], ["U'"]];
const LSE_MOVES = ['M', "M'", 'M2', 'U', "U'", 'U2'];
// 与 ZZ 一致的 R/U、L/U 手序（本地复制一份，避免模块循环依赖）
function mirrorSeqLocal(seq) {
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
const R_SLOT_MACROS = [
  ['R', 'U', "R'"], ['R', 'U2', "R'"], ['R', "U'", "R'"],
  ["R'", 'U', 'R'], ["R'", "U'", 'R'], ["R'", 'U2', 'R'],
  ["U'", 'R', 'U', "R'"], ['U', 'R', 'U', "R'"], ['U2', 'R', 'U', "R'"],
  ['R', 'U', "R'", 'U', 'R', 'U', "R'"], ['R', 'U2', "R'", "U'", 'R', 'U', "R'"],
  ["R'", "U'", 'R', "U'", "R'", 'U', 'R']
];
const L_SLOT_MACROS = R_SLOT_MACROS.map(mirrorSeqLocal);
const M2U2U_MOVES = ['M2', 'U2', 'U', "U'"];
// BFS 目标可用字符串或字符数组（谓词只做下标比较）
const isSolvedState = (st) => (typeof st === 'string' ? st : st.join('')) === SOLVED;
// LSE 投影键：六个剩余棱槽"放的是哪块 + 朝向位"。转移完全由此决定，可安全去重。
// 加上中心轮换与 AUF 偏移后即为完整键（用于收尾阶段）。
const AUF_K_OF_SLOT = { 2: 0, 6: 1, 7: 2, 3: 3 };
const CENTER_SLOTS = [4, 13, 22, 31]; // U/F/D/B 四个中心贴纸
function lseArrKey(st) {
  let k = '';
  for (const slot of LSE_SLOTS) {
    const p = P.edgeSlotOf(st, slot);
    k += String.fromCharCode(65 + (p < 0 ? 0 : p));
    k += edgeOriented(st, slot) ? '0' : '1';
  }
  return k;
}
// 中层中心是否回到原位（LSE 的隐含约束：奇数个 M 会把中心转走，之后 M2/U2 再也回不来）
function centersAligned(st) {
  // 中心贴纸下标：U=4, R=13, F=22, D=31
  return st[4] === 'U' && st[13] === 'R' && st[22] === 'F' && st[31] === 'D';
}
function lseCenterKey(st) {
  let centers = '';
  for (const c of CENTER_SLOTS) centers += st[c];
  return lseArrKey(st) + centers;
}
function lseFullKey(st) {
  let centers = '';
  for (const c of CENTER_SLOTS) centers += st[c];
  const cornerSlot = P.cornerSlotOf(st, 2);
  return lseArrKey(st) + centers + String(AUF_K_OF_SLOT[cornerSlot] == null ? 9 : AUF_K_OF_SLOT[cornerSlot]);
}
// UL/UR 两条棱是否都在顶层
const ulUrInU = (st) => {
  const a = P.edgeSlotOf(st, 9);
  const b = P.edgeSlotOf(st, 11);
  return a >= 0 && b >= 0 && EDGES[a].pos[1] === 1 && EDGES[b].pos[1] === 1;
};

const FACE_OF = (idx) => FACES[Math.floor(idx / 9)];

const edgeOriented = P.edgeOriented;
function lseOriented(st) {
  for (const s of LSE_SLOTS) {
    if (!edgeOriented(st, s)) return false;
  }
  return true;
}

const blockOk = (st) =>
  P.blockPred(FB_EDGES, FB_CORNERS)(st) && P.blockPred(SB_EDGES, SB_CORNERS)(st);

/**
 * Roux 求解
 * @param {string} facelet 54 位状态
 * @returns { moves, stages:[{id,title,hint,emoji,from,moves}], solved }
 */
function solveRoux(facelet) {
  const s = new P.PSession(facelet);
  const stages = [];
  try {
    return solveRouxInner(s, stages);
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

function solveRouxInner(s, stages) {
  const begin = (id, title, hint, emoji) => {
    stages.push({ id, title, hint, emoji, from: s.moves.length, moves: [] });
  };
  const end = () => {
    const cur = stages[stages.length - 1];
    cur.moves = s.moves.slice(cur.from);
  };

  // 1) FB 左桥
  begin('fb', 'FB 左桥', '左边搭一个 1×2×3 的长条（棱+角一起拼）', '🌉');
  // 左桥：逐块构造（DL 底棱 → 两个底角 → 两条中层棱）。
  // 只用 U/L/M 三面即可完成左桥，且天然不会碰右侧（实测这条路径最快最稳）。
  const FB_ORDER = [
    { type: 'e', idx: 8 },
    { type: 'c', idx: 0 },
    { type: 'c', idx: 1 },
    { type: 'e', idx: 4 },
    { type: 'e', idx: 5 }
  ];
  const fbDone = P.solveBlockPieces(s, FB_EDGES, FB_CORNERS, () => true, {
    order: FB_ORDER,
    maxPrim: 6
  });
  if (!fbDone || !P.blockPred(FB_EDGES, FB_CORNERS)(s.st)) throwRoux('FB 左桥构建失败');
  end();

  // 2) SB 右桥
  begin('sb', 'SB 右桥', '右边再搭一个 1×2×3，别弄坏左桥', '🌉');
  // 右桥 = 5 个块逐块归位。每块用「投影键 BFS」：键里同时带上"已完成块的槽位+朝向"，
  // 因此去重是可靠的、搜索可穷尽，且天然保证已完成的块不被留在坏位置（不必再靠保护谓词）。
  // 只走 U/R/M 三面 → 左桥完全碰不到，硬约束天然成立。
  const SB_SEQ = [
    { type: 'e', idx: 10 }, // DR 底棱
    { type: 'c', idx: 4 },  // DRB 角
    { type: 'e', idx: 6 },  // BR 中层棱
    { type: 'c', idx: 5 },  // DFR 角
    { type: 'e', idx: 7 }   // FR 中层棱
  ];
  const SB_MOVES = P.movesOfFaces(['U', 'R', 'M']);
  let sbOk = true;
  const sbProgress = [];
  for (let i = 0; i < SB_SEQ.length; i++) {
    const pc = SB_SEQ[i];
    const group = SB_SEQ.slice(0, i + 1); // 目标块 + 之前的块（守护）
    // 让目标块排在键的第一位（BFS 目标就是它归位）
    const ordered = [{ type: pc.type, idx: pc.idx }].concat(SB_SEQ.slice(0, i));
    const before = s.moves.length;
    let done = P.projectedPieceSolve(s, ordered, SB_MOVES, 12, 220000);
    if (!done) {
      // 兜底：允许更多转动面（左桥由投影键守护）
      done = P.projectedPieceSolve(s, ordered, P.movesOfFaces(['U', 'R', 'L', 'D', 'M']), 11, 220000);
    }
    if (!done) {
      sbOk = false;
      break;
    }
    sbProgress.push({ from: before, to: s.moves.length });
  }
  if (!sbOk || !P.blockPred(SB_EDGES, SB_CORNERS)(s.st) || !P.blockPred(FB_EDGES, FB_CORNERS)(s.st)) {
    throwRoux('SB 右桥构建失败');
  }
  end();

  // 3) CMLL：顶层四角（允许整体 AUF 偏差）
  begin('cmll', 'CMLL 顶层四角', '顶层角块一次性归位，棱块先不用管', '🧠');
  const cmllGoal = (st) => blockOk(st) && P.uCornersSolvedUpToAUF(st);
  if (!P.macroSearch(s, cmllGoal, CMLL_MACROS, 5)) {
    // 提高深度兜底
    if (!P.macroSearch(s, cmllGoal, CMLL_MACROS, 6)) throwRoux('CMLL 求解失败');
  }
  end();

  // 4) LSE：最后六棱（M/U 双层）—— 各阶段用"投影键 BFS"，
  //    状态空间只有几千到几万，完备且快，不依赖运气
  begin('lse-4a', 'LSE ① 翻棱 + 收 UL·UR', '把六条棱朝向翻对，同时把左右两条棱带上顶层（只用 M/U）', '🔄');
  const eoOnly = (st) => blockOk(st) && lseOriented(st);
  const eoUlUr = (st) => eoOnly(st) && ulUrInU(st);
  // 键只含"六棱排布 + 朝向位"：目标（EO / UL·UR 在顶层）完全由它决定，去重安全；
  // 该空间约 4.6 万，上限内可穷尽，因此不会漏解。
  let done4a = P.bfsSolve(s, eoUlUr, { moves: LSE_MOVES, maxDepth: 12, cap: 60000, keyOf: lseArrKey });
  if (!done4a) done4a = P.bfsSolve(s, eoOnly, { moves: LSE_MOVES, maxDepth: 12, cap: 60000, keyOf: lseArrKey });
  if (!done4a) throwRoux('LSE 翻棱失败');
  end();

  begin('lse-4b', 'LSE ② 归位 UL·UR', '左、右两条棱回家（M2/U2 为主）', '🎯');
  const ulUrGoal = (st) => lseOriented(st) && P.edgeSolvedAt(st, 9) && P.edgeSolvedAt(st, 11);
  let done4b = P.bfsSolve(s, ulUrGoal, { moves: M2U2U_MOVES, maxDepth: 10, cap: 60000, keyOf: lseArrKey });
  if (!done4b) done4b = P.bfsSolve(s, ulUrGoal, { moves: LSE_MOVES, maxDepth: 10, cap: 60000, keyOf: lseArrKey });
  if (!done4b) throwRoux('LSE 归位失败');
  end();

  begin('lse-4c', 'LSE ③ 收尾', '中层四条棱各回各位，魔方复原！', '✨');
  // 收尾用完整键（多棱排布 + 中心 + AUF），此时可达状态只有几万，上限内可穷尽
  let done4c = P.bfsSolve(s, isSolvedState, { moves: LSE_MOVES, maxDepth: 16, cap: 120000, keyOf: lseFullKey });
  if (!done4c) done4c = P.bfsSolve(s, isSolvedState, { moves: LSE_MOVES, maxDepth: 14, cap: 150000 });
  if (!done4c) throwRoux('LSE 收尾失败');
  end();

  // 收尾 AUF
  if (s.st !== SOLVED) {
    const probe = new Cube(s.st);
    for (let k = 1; k < 4; k++) {
      probe.move('U');
      if (probe.getFacelet() === SOLVED) {
        s.pushSeq(new Array(k).fill('U'));
        stages[stages.length - 1].moves = s.moves.slice(stages[stages.length - 1].from);
        break;
      }
    }
  }

  return { moves: s.moves, stages, solved: s.st === SOLVED };
}

function throwRoux(msg) {
  const e = new Error(msg);
  e.code = 'ROUX_FAIL';
  throw e;
}

export { solveRoux, centersAligned, lseArrKey, lseCenterKey, lseFullKey, R_SLOT_MACROS, L_SLOT_MACROS, edgeOriented, lseOriented, FB_EDGES, FB_CORNERS, SB_EDGES, SB_CORNERS, CMLL_MACROS, LSE_SLOTS };
