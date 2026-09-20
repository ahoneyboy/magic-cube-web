/**
 * cube2.js —— 2x2 魔方状态模型（24 位 facelet，面序与贴纸方向约定与 cube.js 一致）
 *
 * 几何推导方式与 utils/cube.js 相同，只是网格从 3x3 压缩为 2x2（坐标 ∈ {-1, +1}）。
 * 求解路径：embedTo3x3 把 2x2 角块嵌入一个"棱块全复原 + 标准中心"的 3x3 状态，
 * 复用 3x3 求解器；解法序列可直接作用回 2x2。
 *
 * 本模块不依赖 wx / DOM，可在小程序与 Node 中通用。
 */


import * as c3 from './cube.js';
const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const SOLVED = FACES.map((f) => f.repeat(4)).join('');

const FACE_NORMAL = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1]
};

// 行列 → 小块三维坐标（N=2：r,c ∈ {0,1}，坐标 ∈ {-1,+1}）
const POS_AT = {
  U: (r, c) => [c ? 1 : -1, 1, r ? 1 : -1],
  D: (r, c) => [c ? 1 : -1, -1, r ? -1 : 1],
  F: (r, c) => [c ? 1 : -1, r ? -1 : 1, 1],
  B: (r, c) => [c ? -1 : 1, r ? -1 : 1, -1],
  R: (r, c) => [1, r ? -1 : 1, c ? -1 : 1],
  L: (r, c) => [-1, r ? -1 : 1, c ? 1 : -1]
};

// 坐标 → 行列（逆映射）
const ROWCOL_AT = {
  U: (p) => [p[2] === 1 ? 1 : 0, p[0] === 1 ? 1 : 0],
  D: (p) => [p[2] === -1 ? 1 : 0, p[0] === 1 ? 1 : 0],
  F: (p) => [p[1] === -1 ? 1 : 0, p[0] === 1 ? 1 : 0],
  B: (p) => [p[1] === -1 ? 1 : 0, p[0] === -1 ? 1 : 0],
  R: (p) => [p[1] === -1 ? 1 : 0, p[2] === -1 ? 1 : 0],
  L: (p) => [p[1] === -1 ? 1 : 0, p[2] === 1 ? 1 : 0]
};

const POS_OF = new Array(24);
const NORMAL_OF = new Array(24);
FACES.forEach((face, f) => {
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const i = f * 4 + r * 2 + c;
      POS_OF[i] = POS_AT[face](r, c);
      NORMAL_OF[i] = FACE_NORMAL[face];
    }
  }
});

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalToFace(n) {
  if (n[0] === 1) return 'R';
  if (n[0] === -1) return 'L';
  if (n[1] === 1) return 'U';
  if (n[1] === -1) return 'D';
  return n[2] === 1 ? 'F' : 'B';
}

// 顺时针 90°（从该面外侧看）的坐标变换（与 cube.js 的 ROTATE_CW 相同）
const ROTATE_CW = {
  U: (p) => [-p[2], p[1], p[0]],
  D: (p) => [p[2], p[1], -p[0]],
  R: (p) => [p[0], p[2], -p[1]],
  L: (p) => [p[0], -p[2], p[1]],
  F: (p) => [p[1], -p[0], p[2]],
  B: (p) => [-p[1], p[0], p[2]]
};

function faceletIndexAt(pos, normal) {
  const face = normalToFace(normal);
  const rc = ROWCOL_AT[face](pos);
  return FACES.indexOf(face) * 4 + rc[0] * 2 + rc[1];
}

// 生成 6 个面的顺时针置换表
const QUARTER = {};
FACES.forEach((face) => {
  const normal = FACE_NORMAL[face];
  const rotate = ROTATE_CW[face];
  const perm = new Array(24);
  for (let i = 0; i < 24; i++) perm[i] = i;
  for (let i = 0; i < 24; i++) {
    if (dot(POS_OF[i], normal) !== 1) continue;
    perm[i] = faceletIndexAt(rotate(POS_OF[i]), rotate(NORMAL_OF[i]));
  }
  QUARTER[face] = perm;
});

function applyPerm(state, perm) {
  const next = new Array(24);
  for (let i = 0; i < 24; i++) next[perm[i]] = state[i];
  return next.join('');
}

const ErrorCodes = {
  BAD_LENGTH: 'CUBE2_STATE_BAD_LENGTH',
  BAD_CHARS: 'CUBE2_STATE_BAD_CHARS',
  BAD_COUNTS: 'CUBE2_STATE_BAD_COUNTS',
  BAD_MOVE: 'CUBE2_MOVE_BAD_NOTATION'
};

const MOVE_RE = /^([URFDLB])(2|')?$/;

function stateError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function validateState(facelet) {
  if (typeof facelet !== 'string' || facelet.length !== 24) {
    return { ok: false, code: ErrorCodes.BAD_LENGTH, message: '2x2 状态必须是 24 位字符串' };
  }
  if (/[^URFDLB]/.test(facelet)) {
    return { ok: false, code: ErrorCodes.BAD_CHARS, message: '状态只能包含 U/R/F/D/L/B 六种颜色字母' };
  }
  const counts = {};
  for (const ch of facelet) counts[ch] = (counts[ch] || 0) + 1;
  for (const f of FACES) {
    if (counts[f] !== 4) {
      return { ok: false, code: ErrorCodes.BAD_COUNTS, message: `颜色 ${f} 必须恰好 4 个，当前 ${counts[f] || 0} 个` };
    }
  }
  return { ok: true };
}

function parseSequence(seq) {
  const list = Array.isArray(seq) ? seq : String(seq == null ? '' : seq).trim().split(/\s+/).filter(Boolean);
  return list.map((m) => {
    if (!MOVE_RE.test(m)) throw stateError(ErrorCodes.BAD_MOVE, `非法 2x2 转动记号：${m}`);
    return m;
  });
}

function invertMove(notation) {
  if (notation.length === 2 && notation[1] === '2') return notation;
  return notation.endsWith("'") ? notation[0] : notation + "'";
}

function invertSequence(seq) {
  return parseSequence(seq).slice().reverse().map(invertMove);
}

// ---- 2x2 角块表（顺序与坐标推导，同 cubies.js 的手性约定）----
const ROT_UD_CW = {
  1: (p) => [-p[2], p[1], p[0]],
  '-1': (p) => [p[2], p[1], -p[0]]
};
const FACE_OF_VEC = {
  '1,0,0': 'R', '-1,0,0': 'L', '0,1,0': 'U', '0,-1,0': 'D', '0,0,1': 'F', '0,0,-1': 'B'
};

const CORNERS = [];
for (let x = -1; x <= 1; x += 2) {
  for (let y = -1; y <= 1; y += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const pos = [x, y, z];
      const ud = [0, y, 0];
      const rot = ROT_UD_CW[y];
      const a = [x, 0, 0];
      const b = [0, 0, z];
      const ra = rot(a);
      const ordered = ra[0] === b[0] && ra[2] === b[2] ? [a, b] : [b, a];
      const normals = [ud].concat(ordered);
      CORNERS.push({
        pos,
        normals,
        facelets: normals.map((n) => faceletIndexAt(pos, n)),
        solvedColors: normals.map((n) => FACE_OF_VEC[n.join(',')])
      });
    }
  }
}
const ID_OF_CORNER = new Map();
CORNERS.forEach((c, i) => ID_OF_CORNER.set(c.solvedColors.slice().sort().join(''), i));

// 2x2 可解性：块组合存在性 + 角块朝向和 ≡ 0 (mod 3)。
// 注意 1：2x2 没有中心块，状态只在"差一个整体旋转"意义下有意义，
//         朝向归一由 cubeTypes.normalize2x2Orientation 完成。
// 注意 2：2x2 的四分之一步本身就是角块的奇置换（没有棱块配平），
//         因此置换奇偶不构成约束（这与 3x3 不同）。
function analyzeState(facelet) {
  const base = validateState(facelet);
  if (!base.ok) return base;
  const cp = new Array(8);
  const co = new Array(8);
  const used = new Set();
  for (let i = 0; i < 8; i++) {
    const colors = CORNERS[i].facelets.map((idx) => facelet[idx]);
    const id = ID_OF_CORNER.get(colors.slice().sort().join(''));
    if (id == null) {
      return { ok: false, code: 'CUBE2_UNSOLVABLE_PIECE', message: `不存在的角块组合（${colors.join('/')}）`, slot: i };
    }
    if (used.has(id)) {
      return { ok: false, code: 'CUBE2_UNSOLVABLE_DUPLICATE', message: '出现重复角块，请重新检查', slot: i };
    }
    used.add(id);
    cp[i] = id;
    co[i] = colors.indexOf(colors.find((ch) => ch === 'U' || ch === 'D'));
  }
  let parity = 0;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (cp[i] > cp[j]) parity ^= 1;
  void parity; // 2x2 允许奇置换（见函数头注释）
  if (co.reduce((a, b) => a + b, 0) % 3 !== 0) {
    return { ok: false, code: 'CUBE2_UNSOLVABLE_TWIST', message: '有角块被单独拧转了（真实 2x2 不可能出现），请重新核对' };
  }
  return { ok: true, cp, co };
}

class Cube2 {
  constructor(facelet) {
    this.setState(facelet == null ? SOLVED : facelet);
  }
  setState(facelet24) {
    const v = validateState(facelet24);
    if (!v.ok) throw stateError(v.code, v.message);
    this._state = facelet24;
    return this;
  }
  getFacelet() {
    return this._state;
  }
  move(notation) {
    if (!MOVE_RE.test(notation)) {
      throw stateError(ErrorCodes.BAD_MOVE, `非法 2x2 转动记号：${notation}`);
    }
    const perm = QUARTER[notation[0]];
    if (notation.length === 1) {
      this._state = applyPerm(this._state, perm);
    } else if (notation[1] === '2') {
      this._state = applyPerm(applyPerm(this._state, perm), perm);
    } else {
      this._state = applyPerm(applyPerm(applyPerm(this._state, perm), perm), perm);
    }
    return this;
  }
  applyMoves(seq) {
    parseSequence(seq).forEach((m) => this.move(m));
    return this;
  }
  isSolved() {
    return this._state === SOLVED;
  }
}

/**
 * 把 2x2 状态嵌入 3x3：角块按几何位置 1:1 放入，棱块/中心视为复原。
 * 返回的 3x3 状态可交给任意 3x3 求解器；解法序列同样适用于该 2x2。
 * 中心标准（调用方保证拍摄朝向），若 2x2 整体朝向不同需先做 y 旋转归一。
 */
function embedTo3x3(facelet24) {
  const out = c3.SOLVED.split('');
  for (const corner of CORNERS) {
    corner.normals.forEach((n, i) => {
      const from = corner.facelets[i];
      const to = c3.faceletIndexAt(corner.pos, n);
      out[to] = facelet24[from];
    });
  }
  return out.join('');
}

const Cube = Cube2;

export { FACES, SOLVED, FACE_NORMAL, CORNERS, QUARTER, ErrorCodes, validateState, analyzeState, parseSequence, invertMove, invertSequence, faceletIndexAt, embedTo3x3, Cube };
