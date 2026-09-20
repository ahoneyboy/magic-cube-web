/**
 * unit-cube3d.test.js —— 3D 控制器纯数学测试（与小程序 test/cube3d-model.test.js 同口径）
 *
 * 核心不变量「渲染位姿 === 逻辑位姿」：useCube3D 的整数旋转矩阵（INT_ROT）
 * 作用在 (小块坐标, 贴纸法向) 上得到的 facelet 映射，必须与 engine/cube.js
 * 启动时生成的 QUARTER / QUARTER_SLICE / QUARTER_WIDE 置换表完全一致。
 */
import { describe, it, expect } from 'vitest';
import { INT_ROT, mulVec, mulMat, layersOfNotation } from '../src/composables/useCube3D.js';
import { QUARTER, QUARTER_SLICE, QUARTER_WIDE, FACES, POS_OF, NORMAL_OF, faceletIndexAt } from '../src/engine/cube.js';

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function geomPerm(rotMat, predicate) {
  const perm = new Array(54);
  for (let i = 0; i < 54; i++) perm[i] = i;
  for (let i = 0; i < 54; i++) {
    if (!predicate(POS_OF[i], NORMAL_OF[i])) continue;
    perm[i] = faceletIndexAt(mulVec(rotMat, POS_OF[i]), mulVec(rotMat, NORMAL_OF[i]));
  }
  return perm;
}

describe('3D 渲染位姿 === 逻辑位姿（INT_ROT ↔ QUARTER 置换表）', () => {
  it('6 个外层面：几何推导置换 === engine QUARTER', () => {
    for (const face of FACES) {
      const normalOfFace = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] }[face];
      const perm = geomPerm(INT_ROT[face], (p, n) => dot(p, normalOfFace) === 1);
      expect(perm, `face ${face}`).toEqual(QUARTER[face]);
    }
  });

  it('3 个中层切片：几何推导置换 === engine QUARTER_SLICE', () => {
    const sliceFace = { M: 'L', E: 'D', S: 'F' };
    for (const slice of ['M', 'E', 'S']) {
      const normalOfFace = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] }[sliceFace[slice]];
      const perm = geomPerm(INT_ROT[slice], (p, n) => dot(p, normalOfFace) === 0);
      expect(perm, `slice ${slice}`).toEqual(QUARTER_SLICE[slice]);
    }
  });

  it('宽层（小写记号）：连续两次矩阵乘 === engine QUARTER_WIDE', () => {
    for (const face of FACES) {
      const lower = face.toLowerCase();
      const normalOfFace = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] }[face];
      // 宽层 = 外层 + 中层一起转：整层（dot === 0 或 1）用同一个 INT_ROT
      const perm = geomPerm(INT_ROT[face], (p, n) => {
        const d = dot(p, normalOfFace);
        return d === 0 || d === 1;
      });
      expect(perm, `wide ${lower}`).toEqual(QUARTER_WIDE[lower]);
    }
  });

  it('180°（×2）与逆（×3）矩阵幂一致', () => {
    const rot2 = mulMat(INT_ROT.U, INT_ROT.U);
    const rot3 = mulMat(mulMat(INT_ROT.U, INT_ROT.U), INT_ROT.U);
    const perm2 = geomPerm(rot2, (p) => p[1] === 1);
    const perm3 = geomPerm(rot3, (p) => p[1] === 1);
    // U2 = 应用两次 QUARTER.U；U' = 应用三次
    const apply = (perm, seq) => seq.map((_, i) => perm[seq[i]]);
    const u2 = apply(QUARTER.U, QUARTER.U);
    const u3 = apply(u2, QUARTER.U);
    expect(perm2).toEqual(u2);
    expect(perm3).toEqual(u3);
  });

  it('layersOfNotation：外层/中层/宽层的轴与层坐标', () => {
    expect(layersOfNotation('R')).toEqual({ axis: 0, coords: [1] });
    expect(layersOfNotation('L')).toEqual({ axis: 0, coords: [-1] });
    expect(layersOfNotation('M')).toEqual({ axis: 0, coords: [0] });
    expect(layersOfNotation('E')).toEqual({ axis: 1, coords: [0] });
    expect(layersOfNotation('S')).toEqual({ axis: 2, coords: [0] });
    expect(layersOfNotation('u')).toEqual({ axis: 1, coords: [1, 0] }); // 宽层 = 外层 + 中层
  });
});
