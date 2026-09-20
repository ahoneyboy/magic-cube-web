/**
 * cubeTypes.js —— 魔方类型注册表（"魔方类型可配置"的抽象层）
 *
 * 统一接口（新增魔方类型时实现以下字段并注册即可）：
 *   {
 *     id, name, n,                // 类型标识 / 展示名 / 层数
 *     SOLVED,                     // 复原态 facelet
 *     createCube(facelet?),       // 状态模型实例（move/applyMoves/setState/getFacelet/isSolved）
 *     validateState(facelet),     // 基础校验（长度/字符/数量）
 *     analyzeState(facelet),      // 可解性校验（含友好错误文案）
 *     parseSequence, invertSequence,
 *     toSolverFacelet(facelet),   // 转成 3x3 求解器输入（2x2 为嵌入；3x3 为原样）
 *     fromSolverFacelet(f54),     // 逆转换（3x3 原样）
 *     randomScramble(),           // 默认随机步打乱（random-state 由 scrambler 提供）
 *     stickerCount                // 贴纸总数（渲染/识别用）
 *   }
 */



import * as c3 from './cube.js';
import * as c2 from './cube2.js';
import { analyzeState as analyze3, pieceArrays } from './cubies.js';
import { genScramble } from './scrambler.js';
// ---- 2x2 的 y 轴朝向归一（用户持握朝向不定，先通过整体旋转找回标准朝向）----
const POS2_OF = new Array(24);
const NORMAL2_OF = new Array(24);
(() => {
  const AT = {
    U: (r, c) => [c ? 1 : -1, 1, r ? 1 : -1],
    D: (r, c) => [c ? 1 : -1, -1, r ? -1 : 1],
    F: (r, c) => [c ? 1 : -1, r ? -1 : 1, 1],
    B: (r, c) => [c ? -1 : 1, r ? -1 : 1, -1],
    R: (r, c) => [1, r ? -1 : 1, c ? -1 : 1],
    L: (r, c) => [-1, r ? -1 : 1, c ? 1 : -1]
  };
  c2.FACES.forEach((face, f) => {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const i = f * 4 + r * 2 + c;
        POS2_OF[i] = AT[face](r, c);
        NORMAL2_OF[i] = c2.FACE_NORMAL[face];
      }
    }
  });
})();

// 绕任意轴的整体旋转直接用矩阵（见 rotate2x2ByMat / ROTATIONS24）

// 返回 { facelet, appliedMatrix }；无法通过整体旋转归一（非标准配色/死状态）返回 null。
// 枚举全部 24 个整体旋转（det=+1 的轴置换矩阵），以"嵌入 3x3 后可解"为判据。
function normalize2x2Orientation(facelet24) {
  for (const mat of ROTATIONS24()) {
    const rotated = rotate2x2ByMat(facelet24, mat);
    const embedded = c2.embedTo3x3(rotated);
    if (analyze3(embedded).ok) {
      return { facelet: rotated, matrix: mat };
    }
  }
  return null;
}

// 全部 24 个三维旋转矩阵（元素 ∈ {-1,0,1}，行列式 +1）
let ROT_CACHE = null;
function ROTATIONS24() {
  if (ROT_CACHE) return ROT_CACHE;
  const mats = [];
  const axes = [0, 1, 2];
  const perms = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]
  ];
  for (const p of perms) {
    for (const s0 of [1, -1]) {
      for (const s1 of [1, -1]) {
        for (const s2 of [1, -1]) {
          const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          m[0][p[0]] = s0;
          m[1][p[1]] = s1;
          m[2][p[2]] = s2;
          // 行列式 = 符号排列 × 对角符号积
          const permSign = permParitySign(p);
          const det = permSign * s0 * s1 * s2;
          if (det === 1) mats.push(m);
        }
      }
    }
  }
  void axes;
  ROT_CACHE = mats;
  return mats;
}

function permParitySign(p) {
  let inv = 0;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
  }
  return inv % 2 === 0 ? 1 : -1;
}

function permParity8(cp) {
  let inv = 0;
  for (let i = 0; i < 8; i++) {
    for (let j = i + 1; j < 8; j++) if (cp[i] > cp[j]) inv++;
  }
  return inv % 2;
}

// 交换 3x3 状态里 UF 与 UB 两条棱的贴纸（奇偶补偿用）
function swapUFUBEdges(f54) {
  const g = f54.split('');
  const UF = [7, 19];
  const UB = [1, 10];
  for (let k = 0; k < 2; k++) {
    const t = g[UF[k]];
    g[UF[k]] = g[UB[k]];
    g[UB[k]] = t;
  }
  return g.join('');
}

function mulMatVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

function rotate2x2ByMat(facelet24, mat) {
  const out = new Array(24);
  for (let i = 0; i < 24; i++) {
    out[i] = facelet24[c2.faceletIndexAt(mulMatVec(mat, POS2_OF[i]), mulMatVec(mat, NORMAL2_OF[i]))];
  }
  return out.join('');
}

const TYPES = {
  '3x3': {
    id: '3x3',
    name: '三阶魔方',
    n: 3,
    stickerCount: 54,
    SOLVED: c3.SOLVED,
    faceletIndexAt: c3.faceletIndexAt,
    createCube(facelet) {
      return new c3.Cube(facelet);
    },
    validateState: c3.validateState,
    analyzeState: analyze3,
    parseSequence: c3.parseSequence,
    invertSequence: c3.invertSequence,
    toSolverFacelet: (f) => f,
    fromSolverFacelet: (f) => f,
    randomScramble() {
      return genScramble('3x3');
    }
  },
  '2x2': {
    id: '2x2',
    name: '二阶魔方',
    n: 2,
    stickerCount: 24,
    SOLVED: c2.SOLVED,
    faceletIndexAt: c2.faceletIndexAt,
    createCube(facelet) {
      return new c2.Cube(facelet);
    },
    validateState: c2.validateState,
    analyzeState: c2.analyzeState,
    parseSequence: c2.parseSequence,
    invertSequence: c2.invertSequence,
    // 2x2 朝向归一（24 种整体旋转）后嵌入 3x3。
    // 角块置换奇偶为奇时，"棱全复原"的嵌入必然不可解 —— 额外交换一对棱
    // （UF↔UB）使总奇偶为偶；该补偿只影响 3x3 求解，解法序列对 2x2 依然成立。
    toSolverFacelet(facelet24) {
      const a = c2.analyzeState(facelet24);
      if (!a.ok) return null;
      const needSwap = permParity8(a.cp) === 1;
      for (const mat of ROTATIONS24()) {
        const rotated = rotate2x2ByMat(facelet24, mat);
        let embedded = c2.embedTo3x3(rotated);
        if (needSwap) embedded = swapUFUBEdges(embedded);
        if (analyze3(embedded).ok) return embedded;
      }
      return null;
    },
    fromSolverFacelet: null, // 2x2 不需要逆向
    randomScramble() {
      // WCA 2x2 风格：只使用 <U, R, F>，11 步
      const faces = ['U', 'R', 'F'];
      const out = [];
      let last = null;
      while (out.length < 11) {
        const f = faces[Math.floor(Math.random() * 3)];
        if (f === last) continue;
        out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
        last = f;
      }
      return out;
    }
  }
};

function getType(id) {
  const t = TYPES[id || '3x3'];
  if (!t) {
    const e = new Error('未知魔方类型：' + id);
    e.code = 'CUBE_TYPE_UNKNOWN';
    throw e;
  }
  return t;
}

function listTypes() {
  return Object.keys(TYPES).map((k) => TYPES[k]);
}

export { TYPES, getType, listTypes, normalize2x2Orientation, pieceArrays };
