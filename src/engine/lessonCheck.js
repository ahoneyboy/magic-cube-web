/**
 * lessonCheck.js —— "跟着做"练习判定（P8）
 *
 * 原则（规格要求）：用 facelet 对比目标状态判定，不猜用户意图。
 * 每个阶段一个判定器：输入当前 facelet（虚拟魔方），输出
 *   { pass, progress(0-1), hint }
 * 全部朝向约定"白底黄顶"（白色 = D 面朝下）。
 */



import { SOLVED } from './cube.js';
import { CORNERS, EDGES, pieceArrays } from './cubies.js';
import { edgeOriented } from './pieceSolver.js';
function faceRow(f) {
  const START = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };
  const s = START[f];
  return (r) => [s + r * 3, s + r * 3 + 1, s + r * 3 + 2];
}
const row = faceRow('D');
function rowOf(f, r) {
  return faceRow(f)(r);
}
function allEqual(st, idx, ch) {
  for (let i = 0; i < idx.length; i++) if (st[idx[i]] !== ch) return false;
  return true;
}

// ---- 各阶段目标谓词（由易到难，逐级包含）----
function dCrossDone(st) {
  // D 面十字：4 条 D 棱的 D 面贴纸 = D，且侧面贴纸与中心对齐
  // （面序 U:0-8 R:9-17 F:18-26 D:27-35 L:36-44 B:45-53）
  const pairs = [
    [28, 25], // DF: D 面上中 + F 面下中
    [32, 16], // DR: D 面右中 + R 面下中
    [34, 52], // DB: D 面下中 + B 面下中
    [30, 43]  // DL: D 面左中 + L 面下中
  ];
  return pairs.every(([d, s]) => st[d] === 'D' && st[s] === SIDE_OF(d));
}
const SIDE_OF = (dIdx) => ({ 28: 'F', 32: 'R', 34: 'B', 30: 'L' }[dIdx]);

function firstLayerDone(st) {
  return (
    dCrossDone(st) &&
    allEqual(st, [27, 28, 29, 30, 31, 32, 33, 34, 35], 'D') &&
    allEqual(st, rowOf('F', 2), 'F') &&
    allEqual(st, rowOf('R', 2), 'R') &&
    allEqual(st, rowOf('L', 2), 'L') &&
    allEqual(st, rowOf('B', 2), 'B')
  );
}

function twoLayersDone(st) {
  return (
    firstLayerDone(st) &&
    allEqual(st, rowOf('F', 1), 'F') &&
    allEqual(st, rowOf('R', 1), 'R') &&
    allEqual(st, rowOf('L', 1), 'L') &&
    allEqual(st, rowOf('B', 1), 'B')
  );
}

function uCrossDone(st) {
  return st[1] === 'U' && st[3] === 'U' && st[5] === 'U' && st[7] === 'U';
}

function uFaceDone(st) {
  return allEqual(st, [0, 1, 2, 3, 4, 5, 6, 7, 8], 'U');
}

// 顶层角块侧面颜色对齐（U 面同色 + 角块位置正确，棱块不管）
function uCornersPermuted(st) {
  if (!uFaceDone(st)) return false;
  const corners = [
    // [两个侧面 facelet 下标, 期望颜色]
    [[9 + 2, 18], ['R', 'F']],   // URF: R 面上右? U facelet 8 的角块：R 面 (0,2)=11? 简化用组合判断
  ];
  // 直接用块级判断：U 角块位置正确（侧面贴纸与中心一致）
  const pa = pieceArrays(st);
  for (let i = 0; i < 8; i++) {
    const c = CORNERS[i];
    if (c.pos[1] !== 1) continue;
    const sideOk = st[c.facelets[1]] === c.solvedColors[1] && st[c.facelets[2]] === c.solvedColors[2];
    if (!sideOk) return false;
  }
  void corners;
  return true;
}

function solvedDone(st) {
  return st === SOLVED;
}

// ---- 进阶解法练习判定（桥 / 大块 / EOLine）----
function edgeOkAt(st, i) {
  const e = EDGES[i];
  return st[e.facelets[0]] === e.solvedColors[0] && st[e.facelets[1]] === e.solvedColors[1];
}
function cornerOkAt(st, i) {
  const c = CORNERS[i];
  return (
    st[c.facelets[0]] === c.solvedColors[0] &&
    st[c.facelets[1]] === c.solvedColors[1] &&
    st[c.facelets[2]] === c.solvedColors[2]
  );
}
function specProgress(st, edges, corners) {
  const total = edges.length + corners.length;
  let n = 0;
  edges.forEach((i) => { if (edgeOkAt(st, i)) n++; });
  corners.forEach((i) => { if (cornerOkAt(st, i)) n++; });
  return n / total;
}
const FB_EDGES = [8, 4, 5];
const FB_CORNERS = [0, 1];
const SB_EDGES = [10, 6, 7];
const SB_CORNERS = [4, 5];
const BLOCK223_EDGES = [8, 5, 4, 1, 0];
const BLOCK223_CORNERS = [0, 1];

function eoMaskAllZero(st) {
  for (let i = 0; i < 12; i++) if (!edgeOriented(st, i)) return false;
  return true;
}

const CHECKERS = {
  explore: (st, moveCount) => ({ pass: moveCount >= 6, progress: Math.min(1, moveCount / 6) }),
  dCross: (st) => ({
    pass: dCrossDone(st),
    progress: ['DF', 'DR', 'DB', 'DL'].reduce((acc, k, i) => acc + (dCrossDone(st) ? 1 : partialCross(st, i)), 0) / 4
  }),
  firstLayer: (st) => ({
    pass: firstLayerDone(st),
    progress: dCrossDone(st) ? (firstLayerDone(st) ? 1 : 0.5) : 0.25
  }),
  twoLayers: (st) => ({
    pass: twoLayersDone(st),
    progress: firstLayerDone(st) ? (twoLayersDone(st) ? 1 : 0.6) : 0.3
  }),
  uCross: (st) => ({
    pass: uCrossDone(st),
    progress: [1, 3, 5, 7].filter((i) => st[i] === 'U').length / 4
  }),
  uFaceAndCorners: (st) => ({
    pass: uFaceDone(st) && uCornersPermuted(st),
    progress: uFaceDone(st) ? 0.6 : uCrossDone(st) ? 0.3 : 0
  }),
  // Roux：左桥（FB）
  blockFB: (st) => ({
    pass: FB_EDGES.every((i) => edgeOkAt(st, i)) && FB_CORNERS.every((i) => cornerOkAt(st, i)),
    progress: specProgress(st, FB_EDGES, FB_CORNERS)
  }),
  // Roux：两座桥
  blockSB: (st) => ({
    pass:
      FB_EDGES.every((i) => edgeOkAt(st, i)) &&
      FB_CORNERS.every((i) => cornerOkAt(st, i)) &&
      SB_EDGES.every((i) => edgeOkAt(st, i)) &&
      SB_CORNERS.every((i) => cornerOkAt(st, i)),
    progress:
      (specProgress(st, FB_EDGES, FB_CORNERS) + specProgress(st, SB_EDGES, SB_CORNERS)) / 2
  }),
  // Petrus：2×2×3 大块
  block223: (st) => ({
    pass: BLOCK223_EDGES.every((i) => edgeOkAt(st, i)) && BLOCK223_CORNERS.every((i) => cornerOkAt(st, i)),
    progress: specProgress(st, BLOCK223_EDGES, BLOCK223_CORNERS)
  }),
  // ZZ：EOLine（12 条棱朝向全对 + DF、DB 归位）
  eoline: (st) => ({
    pass: eoMaskAllZero(st) && edgeOkAt(st, 1) && edgeOkAt(st, 0),
    progress: (() => {
      let oriented = 0;
      for (let i = 0; i < 12; i++) if (edgeOriented(st, i)) oriented++;
      let line = 0;
      if (edgeOkAt(st, 1)) line += 0.5;
      if (edgeOkAt(st, 0)) line += 0.5;
      return oriented / 12 * 0.6 + line * 0.4;
    })()
  }),
  solved: (st) => ({
    pass: solvedDone(st),
    progress: uFaceDone(st) ? (uCornersPermuted(st) ? (solvedDone(st) ? 1 : 0.85) : 0.6) : uCrossDone(st) ? 0.4 : 0.2
  })
};

function partialCross(st, i) {
  const pairs = [
    [28, 25],
    [32, 16],
    [34, 52],
    [30, 43]
  ];
  const [d, s] = pairs[i];
  return st[d] === 'D' && st[s] === SIDE_OF(d) ? 1 : 0;
}

/**
 * 判定练习
 * @param {string} checkId lessonData 中的 checkId
 * @param {string} facelet 当前虚拟魔方状态
 * @param {number} moveCount 本次练习已转动的步数
 */
function checkPractice(checkId, facelet, moveCount) {
  const fn = CHECKERS[checkId];
  if (!fn) return { pass: false, progress: 0 };
  const r = fn(facelet, moveCount || 0);
  return { pass: !!r.pass, progress: Math.max(0, Math.min(1, r.progress || 0)) };
}

export { checkPractice, eoMaskAllZero, dCrossDone, firstLayerDone, twoLayersDone, uCrossDone, uFaceDone };
