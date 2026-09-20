/**
 * cube.js —— 全项目统一的魔方状态模型
 *
 * 约定（与 cube-solver / Kociemba 二阶段算法一致，P4 集成求解器时以转换测试对齐）：
 * - 状态用 54 位 facelet 字符串表示，面序 U R F D L B
 * - 每面 9 个贴纸按"从该面外侧正视、行优先"编号：faceIndex * 9 + row * 3 + col
 * - 各面正视方向：U(上边是 B，右边是 R)  D(上边是 F，右边是 R)  F(上边是 U，右边是 R)
 *   B(上边是 U，右边是 L)  R(上边是 U，右边是 B)  L(上边是 U，右边是 F)
 * - 贴纸字符表示颜色，用该颜色在复原态所属面的字母表示（如白色记为 U）
 *
 * 本模块不依赖 wx / DOM，可在小程序与 Node（单元测试）中通用。
 */

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const SOLVED = FACES.map((f) => f.repeat(9)).join('');

const FACE_NORMAL = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1]
};

// 行列 → 小块三维坐标（-1/0/1），与上面"正视方向"约定一一对应
const POS_AT = {
  U: (r, c) => [c - 1, 1, r - 1],
  D: (r, c) => [c - 1, -1, 1 - r],
  F: (r, c) => [c - 1, 1 - r, 1],
  B: (r, c) => [1 - c, 1 - r, -1],
  R: (r, c) => [1, 1 - r, 1 - c],
  L: (r, c) => [-1, 1 - r, c - 1]
};

// 坐标 → 行列（POS_AT 的逆映射，供反查 facelet 下标）
const ROWCOL_AT = {
  U: (p) => [p[2] + 1, p[0] + 1],
  D: (p) => [1 - p[2], p[0] + 1],
  F: (p) => [1 - p[1], p[0] + 1],
  B: (p) => [1 - p[1], 1 - p[0]],
  R: (p) => [1 - p[1], 1 - p[2]],
  L: (p) => [1 - p[1], p[2] + 1]
};

const POS_OF = new Array(54);
const NORMAL_OF = new Array(54);
FACES.forEach((face, f) => {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const i = f * 9 + r * 3 + c;
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

// 顺时针 90°（从该面外侧看）时三维坐标的变换
const ROTATE_CW = {
  U: (p) => [-p[2], p[1], p[0]],
  D: (p) => [p[2], p[1], -p[0]],
  R: (p) => [p[0], p[2], -p[1]],
  L: (p) => [p[0], -p[2], p[1]],
  F: (p) => [p[1], -p[0], p[2]],
  B: (p) => [-p[1], p[0], p[2]]
};

// 由（小块坐标, 贴纸朝向）反查 facelet 下标；渲染器用同一映射保证贴纸与状态一致
function faceletIndexAt(pos, normal) {
  const face = normalToFace(normal);
  const rc = ROWCOL_AT[face](pos);
  return FACES.indexOf(face) * 9 + rc[0] * 3 + rc[1];
}

// 启动时生成 6 个面顺时针 90° 的置换表：perm[旧下标] = 新下标
const QUARTER = {};
FACES.forEach((face) => {
  const normal = FACE_NORMAL[face];
  const rotate = ROTATE_CW[face];
  const perm = new Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (let i = 0; i < 54; i++) {
    if (dot(POS_OF[i], normal) !== 1) continue;
    perm[i] = faceletIndexAt(rotate(POS_OF[i]), rotate(NORMAL_OF[i]));
  }
  QUARTER[face] = perm;
});

// 中层切片 M/E/S：跟随 L/D/F 面的顺时针方向（标准约定），仅转动中间层（dot === 0）
const SLICE_OF = { M: 'L', E: 'D', S: 'F' };
const QUARTER_SLICE = {};
Object.keys(SLICE_OF).forEach((slice) => {
  const face = SLICE_OF[slice];
  const normal = FACE_NORMAL[face];
  const rotate = ROTATE_CW[face];
  const perm = new Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (let i = 0; i < 54; i++) {
    if (dot(POS_OF[i], normal) !== 0) continue;
    perm[i] = faceletIndexAt(rotate(POS_OF[i]), rotate(NORMAL_OF[i]));
  }
  QUARTER_SLICE[slice] = perm;
});

// 宽层记号（小写 r/u/f/d/l/b）：外层 + 中间层一起转（绕面法向的刚体旋转）
const QUARTER_WIDE = {};
FACES.forEach((face) => {
  const lower = face.toLowerCase();
  const normal = FACE_NORMAL[face];
  const rotate = ROTATE_CW[face];
  const perm = new Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (let i = 0; i < 54; i++) {
    const d = dot(POS_OF[i], normal);
    if (d !== 0 && d !== 1) continue;
    perm[i] = faceletIndexAt(rotate(POS_OF[i]), rotate(NORMAL_OF[i]));
  }
  QUARTER_WIDE[lower] = perm;
});

const PERMS = Object.assign({}, QUARTER, QUARTER_SLICE, QUARTER_WIDE);

function applyPerm(state, perm) {
  const next = new Array(54);
  for (let i = 0; i < 54; i++) next[perm[i]] = state[i];
  return next.join('');
}

const ErrorCodes = {
  BAD_LENGTH: 'CUBE_STATE_BAD_LENGTH',
  BAD_CHARS: 'CUBE_STATE_BAD_CHARS',
  BAD_COUNTS: 'CUBE_STATE_BAD_COUNTS',
  BAD_MOVE: 'CUBE_MOVE_BAD_NOTATION'
};

const MOVE_RE = /^([URFDLB]|[MES]|[urfdlb])(2|')?$/;

function stateError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function validateState(facelet) {
  if (typeof facelet !== 'string' || facelet.length !== 54) {
    return { ok: false, code: ErrorCodes.BAD_LENGTH, message: '状态必须是 54 位字符串' };
  }
  if (/[^URFDLB]/.test(facelet)) {
    return { ok: false, code: ErrorCodes.BAD_CHARS, message: '状态只能包含 U/R/F/D/L/B 六种颜色字母' };
  }
  const counts = {};
  for (const ch of facelet) counts[ch] = (counts[ch] || 0) + 1;
  for (const f of FACES) {
    if (counts[f] !== 9) {
      return { ok: false, code: ErrorCodes.BAD_COUNTS, message: `颜色 ${f} 必须恰好 9 个，当前 ${counts[f] || 0} 个` };
    }
  }
  return { ok: true };
}

function parseSequence(seq) {
  const list = Array.isArray(seq)
    ? seq
    : String(seq == null ? '' : seq).trim().split(/\s+/).filter(Boolean);
  return list.map((m) => {
    if (!MOVE_RE.test(m)) {
      throw stateError(ErrorCodes.BAD_MOVE, `非法转动记号：${m}（支持 URFDLB / 中层 MES / 宽层小写，加 ' 或 2）`);
    }
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

// 六面各自同色即视为复原（允许整体朝向不同——含中层转动的自由玩法也能正确庆祝）
function isSolvedUpToRotation(facelet) {
  for (let f = 0; f < 6; f++) {
    const a = facelet[f * 9];
    for (let i = 1; i < 9; i++) {
      if (facelet[f * 9 + i] !== a) return false;
    }
  }
  return true;
}

class Cube {
  constructor(facelet) {
    this.setState(facelet == null ? SOLVED : facelet);
  }

  setState(facelet54) {
    const v = validateState(facelet54);
    if (!v.ok) throw stateError(v.code, v.message);
    this._state = facelet54;
    return this;
  }

  getFacelet() {
    return this._state;
  }

  move(notation) {
    const perm = PERMS[notation[0]];
    if (typeof notation !== 'string' || !MOVE_RE.test(notation) || !perm) {
      throw stateError(ErrorCodes.BAD_MOVE, `非法转动记号：${notation}（支持 URFDLB / 中层 MES / 宽层小写，加 ' 或 2）`);
    }
    const quarter = perm;
    if (notation.length === 1) {
      this._state = applyPerm(this._state, quarter);
    } else if (notation[1] === '2') {
      this._state = applyPerm(applyPerm(this._state, quarter), quarter);
    } else {
      this._state = applyPerm(applyPerm(applyPerm(this._state, quarter), quarter), quarter);
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

  colorCounts() {
    const counts = {};
    for (const ch of this._state) counts[ch] = (counts[ch] || 0) + 1;
    return counts;
  }
}

export { Cube, FACES, SOLVED, FACE_NORMAL, POS_OF, NORMAL_OF, ErrorCodes, validateState, parseSequence, invertMove, invertSequence, isSolvedUpToRotation, faceletIndexAt, QUARTER, QUARTER_SLICE, QUARTER_WIDE };
