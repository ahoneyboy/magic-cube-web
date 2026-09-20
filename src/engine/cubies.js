/**
 * cubies.js —— 魔方块级模型（角块 / 棱块的置换与朝向）+ 可解性校验
 *
 * 全部由 utils/cube.js 的几何约定（POS_OF / NORMAL_OF / faceletIndexAt）程序化推导，
 * 不手工抄表，保证与状态模型永远一致。
 *
 * 可解性判据（三元约束，任一不满足即死状态）：
 * - 置换奇偶：角块置换奇偶性 === 棱块置换奇偶性
 * - 角块朝向：所有角块朝向值之和 ≡ 0 (mod 3)
 * - 棱块朝向：所有棱块朝向值之和 ≡ 0 (mod 2)
 *
 * 本模块不依赖 wx / DOM，可在小程序与 Node 中通用。
 */



import { FACES, NORMAL_OF, POS_OF, faceletIndexAt, validateState } from './cube.js';
const FACE_OF_VEC = { '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B' };
const faceKey = (n) => n.join(',');

// ---- 角块：8 个位置（|x|=|y|=|z|=1），贴纸顺序固定为 x/y/z 轴法向 ----
const CORNERS = [];
const EDGES = [];

// 角块贴纸顺序约定（与 Kociemba 一致）：第 1 个是 U/D 面贴纸，其余两个按
// "从该 U/D 面外侧看顺时针"排列 —— 朝向不变量（Σori ≡ 0 mod 3）在此约定下才成立。
const ROT_UD_CW = {
  1: (p) => [-p[2], p[1], p[0]],
  '-1': (p) => [p[2], p[1], -p[0]]
};

for (let x = -1; x <= 1; x += 2) {
  for (let y = -1; y <= 1; y += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const pos = [x, y, z];
      const ud = [0, y, 0];
      const rot = ROT_UD_CW[y];
      const a = [x, 0, 0];
      const b = [0, 0, z];
      const ra = rot(a);
      // 侧面顺序取顺时针循环方向：rot(first) === second
      const ordered = ra[0] === b[0] && ra[2] === b[2] ? [a, b] : [b, a];
      const normals = [ud].concat(ordered);
      const facelets = normals.map((n) => faceletIndexAt(pos, n));
      CORNERS.push({
        pos,
        normals,
        facelets,
        solvedColors: normals.map((n) => FACE_OF_VEC[faceKey(n)])
      });
    }
  }
}

for (let a = 0; a < 3; a++) {
  for (let s1 = -1; s1 <= 1; s1 += 2) {
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      const pos = [0, 0, 0];
      pos[a] = 0;
      const axes = [0, 1, 2].filter((i) => i !== a);
      pos[axes[0]] = s1;
      pos[axes[1]] = s2;
      const n1 = [0, 0, 0];
      const n2 = [0, 0, 0];
      n1[axes[0]] = s1;
      n2[axes[1]] = s2;
      // 固定棱块贴纸顺序：先 U/D 轴（若有），否则 F/B 轴，再另一轴 —— 保证朝向定义稳定
      const ranked = [n1, n2].sort((p, q) => axisRank(p) - axisRank(q));
      const facelets = ranked.map((n) => faceletIndexAt(pos, n));
      EDGES.push({
        pos,
        normals: ranked,
        facelets,
        solvedColors: ranked.map((n) => FACE_OF_VEC[faceKey(n)])
      });
    }
  }
}

function axisRank(n) {
  if (n[1] !== 0) return 0; // U/D 最优先
  if (n[2] !== 0) return 1; // F/B 次之
  return 2; // R/L 最后
}

const CORNER_KEY = new Map(CORNERS.map((c) => [c.solvedColors.slice().sort().join(''), c.solvedColors]));
const EDGE_KEY = new Map(EDGES.map((e) => [e.solvedColors.slice().sort().join(''), e.solvedColors]));

const ErrorCodes = {
  CENTERS: 'CUBE_UNSOLVABLE_CENTERS',
  PIECE: 'CUBE_UNSOLVABLE_PIECE',
  DUPLICATE: 'CUBE_UNSOLVABLE_DUPLICATE',
  TWIST: 'CUBE_UNSOLVABLE_TWIST',
  FLIP: 'CUBE_UNSOLVABLE_FLIP',
  PARITY: 'CUBE_UNSOLVABLE_PARITY'
};

function permParity(perm) {
  let parity = 0;
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) {
      if (perm[i] > perm[j]) parity ^= 1;
    }
  }
  return parity;
}

/**
 * 分析 54 位状态 → 块级置换/朝向；不合法（含不可解）返回 { ok:false, code, message }
 * 中心块必须为标准配色（U R F D L B），因为求解器与 3D 渲染共用该朝向约定。
 */
function analyzeState(facelet) {
  const base = validateState(facelet);
  if (!base.ok) return base;

  const centers = [4, 13, 22, 31, 40, 49].map((i) => facelet[i]);
  for (let f = 0; f < 6; f++) {
    if (centers[f] !== FACES[f]) {
      return {
        ok: false,
        code: ErrorCodes.CENTERS,
        message: `中心块颜色与标准朝向不符（${FACES[f]} 面中心应为 ${FACES[f]} 色），请检查拍摄朝向`,
        face: FACES[f]
      };
    }
  }

  const cornerPerm = new Array(8);
  const cornerOri = new Array(8);
  const usedCorners = new Set();
  for (let i = 0; i < 8; i++) {
    const c = CORNERS[i];
    const colors = c.facelets.map((idx) => facelet[idx]);
    const key = colors.slice().sort().join('');
    const piece = CORNER_KEY.get(key);
    if (!piece) {
      return {
        ok: false,
        code: ErrorCodes.PIECE,
        message: `存在不存在的角块颜色组合（${colors.join('/')}），请检查是否拍错或识别错误`,
        slot: i
      };
    }
    const pieceId = CORNERS.findIndex((p) => p.solvedColors.join('') === piece.join(''));
    if (usedCorners.has(pieceId)) {
      return { ok: false, code: ErrorCodes.DUPLICATE, message: '出现重复角块：同一块出现在两个位置，请重新检查', slot: i };
    }
    usedCorners.add(pieceId);
    cornerPerm[i] = pieceId;
    const udColor = piece.find((ch) => ch === 'U' || ch === 'D');
    cornerOri[i] = colors.indexOf(udColor);
  }

  const edgePerm = new Array(12);
  const edgeOri = new Array(12);
  const usedEdges = new Set();
  for (let i = 0; i < 12; i++) {
    const e = EDGES[i];
    const colors = e.facelets.map((idx) => facelet[idx]);
    const key = colors.slice().sort().join('');
    const piece = EDGE_KEY.get(key);
    if (!piece) {
      return {
        ok: false,
        code: ErrorCodes.PIECE,
        message: `存在不存在的棱块颜色组合（${colors.join('/')}），请检查是否拍错或识别错误`,
        slot: i
      };
    }
    const pieceId = EDGES.findIndex((p) => p.solvedColors.join('') === piece.join(''));
    if (usedEdges.has(pieceId)) {
      return { ok: false, code: ErrorCodes.DUPLICATE, message: '出现重复棱块：同一块出现在两个位置，请重新检查', slot: i };
    }
    usedEdges.add(pieceId);
    edgePerm[i] = pieceId;
    // 朝向（可证 18 种基本转动下 Σeo 偶性不变）：
    // 基准色贴纸（U/D 色优先，否则 F/B 色）在槽位有序贴纸对中的下标（0/1）。
    // 槽位贴纸序：U/D 面优先，其次 F/B 面（见 EDGES 构造）。
    const refColor = piece.find((ch) => ch === 'U' || ch === 'D') || piece.find((ch) => ch === 'F' || ch === 'B');
    edgeOri[i] = colors.indexOf(refColor);
  }

  if (cornerOri.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return { ok: false, code: ErrorCodes.TWIST, message: '有角块被单独拧转了（真实魔方不可能出现），请重新核对' };
  }
  if (edgeOri.reduce((a, b) => a + b, 0) % 2 !== 0) {
    return { ok: false, code: ErrorCodes.FLIP, message: '有棱块被单独翻面了（真实魔方不可能出现），请重新核对' };
  }
  if (permParity(cornerPerm) !== permParity(edgePerm)) {
    return { ok: false, code: ErrorCodes.PARITY, message: '有两块被单独交换了（真实魔方不可能出现），请重新核对' };
  }

  return { ok: true, cornerPerm, cornerOri, edgePerm, edgeOri };
}

function checkSolvability(facelet) {
  return analyzeState(facelet);
}

// 假定状态合法（中心标准），快速取块级置换/朝向数组（LBL 求解器内部用）
const ID_OF_CORNER = new Map();
const ID_OF_EDGE = new Map();
CORNERS.forEach((c, i) => ID_OF_CORNER.set(c.solvedColors.slice().sort().join(''), i));
EDGES.forEach((e, i) => ID_OF_EDGE.set(e.solvedColors.slice().sort().join(''), i));

function pieceArrays(facelet) {
  const cp = new Array(8);
  const co = new Array(8);
  for (let i = 0; i < 8; i++) {
    const colors = CORNERS[i].facelets.map((idx) => facelet[idx]);
    const id = ID_OF_CORNER.get(colors.slice().sort().join(''));
    cp[i] = id;
    co[i] = colors.indexOf(colors.find((ch) => ch === 'U' || ch === 'D'));
  }
  const ep = new Array(12);
  const eo = new Array(12);
  for (let i = 0; i < 12; i++) {
    const colors = EDGES[i].facelets.map((idx) => facelet[idx]);
    const id = ID_OF_EDGE.get(colors.slice().sort().join(''));
    ep[i] = id;
    const piece = EDGES[id].solvedColors;
    const refColor = piece.find((ch) => ch === 'U' || ch === 'D') || piece.find((ch) => ch === 'F' || ch === 'B');
    eo[i] = colors.indexOf(refColor);
  }
  return { cp, co, ep, eo };
}

export { CORNERS, EDGES, analyzeState, checkSolvability, pieceArrays, ErrorCodes };
