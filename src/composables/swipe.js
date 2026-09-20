/**
 * swipe.js —— 触摸滑动 → 转层记号判定（纯函数，可在 Node 中单元测试）
 *
 * 算法（真实魔方 App 的通用做法，规避视角/平行法向等退化情形）：
 * 1. 屏幕滑动向量经相机基向量换算成世界方向，再用视角四元数的逆变换到
 *    魔方局部坐标系 —— 视角怎么转都不会错乱；
 * 2. 枚举全部候选转动（每轴 3 层 × 正反 2 向 = 18 种），计算被触摸小块
 *    在每个候选转动下的速度 v = ω·â×P，与滑动方向做余弦打分；
 * 3. 取最优候选，且得分 ≥ minScore（滑动阈值/误判控制的关键参数）才判定。
 *
 * 无 three.js / wx 依赖，四元数用数组 [x, y, z, w]。
 */

// 记号定义：axis（0=x,1=y,2=z）、coord（层坐标 -1/0/1）、
// cwSign：顺时针（从面外看）等价于绕正轴 90° 的方向符号
// （R/U/F 顺时针 = 绕正轴 -90°；L/D/B 顺时针 = +90°；中层 M 跟 L、E 跟 D、S 跟 F）
const LETTER_DEF = {
  R: { axis: 0, coord: 1, cwSign: -1 },
  L: { axis: 0, coord: -1, cwSign: 1 },
  U: { axis: 1, coord: 1, cwSign: -1 },
  D: { axis: 1, coord: -1, cwSign: 1 },
  F: { axis: 2, coord: 1, cwSign: -1 },
  B: { axis: 2, coord: -1, cwSign: 1 },
  M: { axis: 0, coord: 0, cwSign: 1 },
  E: { axis: 1, coord: 0, cwSign: 1 },
  S: { axis: 2, coord: 0, cwSign: -1 }
};

function quatToMatrix(q) {
  const [x, y, z, w] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}

function mulMatVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalized(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l < 1e-9) return null;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const AXIS_UNITS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * 分析滑动（不设阈值，供"拖动预览"与"提交判定"共用）
 * @returns {{ notation: string, score: number, margin: number } | null}
 *   notation 最佳候选记号；score 最佳匹配度(0-1)；margin 与次佳的差值（越大越不模糊）
 */
function analyzeSwipe(p) {
  const inv = quatToMatrix(p.viewQuat); // 正交 → 转置即逆
  const wWorld = [
    p.camRight[0] * p.swipe[0] - p.camUp[0] * p.swipe[1],
    p.camRight[1] * p.swipe[0] - p.camUp[1] * p.swipe[1],
    p.camRight[2] * p.swipe[0] - p.camUp[2] * p.swipe[1]
  ];
  const wLocal = normalized(mulMatVec(inv, wWorld));
  return analyzeLocal(p, wLocal);
}

function analyzeLocal(p, wLocal) {
  if (!wLocal) return null;
  const P = p.stickerLocal || p.pos; // 速度取贴纸触点（更贴合手指接触点）
  const allowSlices = p.allowSlices !== false;
  let best = null;
  let second = -Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const coord = p.pos[axis];
    if (coord === 0 && !allowSlices) continue; // 中层关闭时该轴不参与
    const v1 = cross(AXIS_UNITS[axis], P);
    const v1n = normalized(v1);
    if (!v1n) continue;
    const score1 = dot(v1n, wLocal);
    const omega = score1 >= -score1 ? 1 : -1;
    const score = Math.abs(score1);
    if (!best || score > best.score) {
      if (best) second = best.score;
      best = { axis, coord, omega, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (!best) return null;
  let letter = null;
  Object.keys(LETTER_DEF).some((key) => {
    const d = LETTER_DEF[key];
    if (d.axis === best.axis && d.coord === best.coord) {
      letter = key;
      return true;
    }
    return false;
  });
  if (!letter) return null;
  const suffix = best.omega === LETTER_DEF[letter].cwSign ? '' : "'";
  return {
    notation: letter + suffix,
    score: best.score,
    margin: best.score - (second === -Infinity ? 0 : second)
  };
}

/**
 * 判定一次滑动对应的转层记号
 * @param {Object} p
 *   pos:         [x,y,z]    被触摸小块逻辑坐标（∈{-1,0,1}，2x2 无 0）
 *   swipe:       [dx,dy]    屏幕滑动向量（像素，dy 向下为正）
 *   camRight:    [x,y,z]    相机右方向（世界系，单位化）
 *   camUp:       [x,y,z]    相机上方向（世界系，单位化）
 *   viewQuat:    [x,y,z,w]  视角旋转四元数（cubeGroup.quaternion）
 *   allowSlices: boolean    是否允许中层 M/E/S
 *   n:           number     2 | 3（2x2 时无中层坐标）
 *   minScore:    number     判定阈值（0-1]，默认 0.5，可调
 * @returns {string|null} 记号（只产生 90°，如 "R"/"U'"），无法判定返回 null
 */
function decideSwipe(p) {
  const minScore = p.minScore == null ? 0.5 : p.minScore;
  const r = analyzeSwipe(p);
  if (!r || r.score < minScore) return null;
  return r.notation;
}

export { decideSwipe, analyzeSwipe, quatToMatrix, mulMatVec, cross, dot, LETTER_DEF };
