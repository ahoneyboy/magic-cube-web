/**
 * engine-scan.test.js —— 拍照识别颜色分类（与小程序 test/scancolor.test.js 同口径）
 *
 * 用合成光照场景模拟"照片"像素样本，对比两条识别路径：
 *   A) 旧路径：理想色卡绝对分类（classify）
 *   B) 新路径：实测中心色 + 白平衡归一 + 相对分类（classifyRelative）
 * 任务 §8：暖光/冷光/昏暗/过曝/噪声全场景，新路径 54/54。
 */
import { describe, it, expect } from 'vitest';
import { Cube, SOLVED, FACES } from '../src/engine/cube.js';
import { CUBE_COLORS } from '../src/engine/config/index.js';
import * as cm from '../src/engine/colorMatch.js';

const PALETTE = CUBE_COLORS;
const LETTERS = Object.keys(PALETTE);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const IDEAL = {};
LETTERS.forEach((k) => {
  IDEAL[k] = hexToRgb(PALETTE[k]);
});

let seed = 20240915;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function jitter(amp) {
  return (rnd() * 2 - 1) * amp;
}

function makeSamples(letter, light, noise, samplesPerCell) {
  const base = IDEAL[letter];
  const out = [];
  for (let i = 0; i < samplesPerCell; i++) {
    const shade = 1 + jitter(0.05);
    out.push({
      r: Math.max(0, Math.min(255, base.r * light.gain.r * light.bright * shade + jitter(noise) * light.shading.r)),
      g: Math.max(0, Math.min(255, base.g * light.gain.g * light.bright * shade + jitter(noise) * light.shading.g)),
      b: Math.max(0, Math.min(255, base.b * light.gain.b * light.bright * shade + jitter(noise) * light.shading.b))
    });
  }
  return out;
}

const SCRAMBLE = ['R', 'U', "R'", "U'", 'F', 'R', 'U', "R'", "U'", "F'", 'D', 'L2', 'B', "R'"];
const FACELETS = (() => {
  const c = new Cube(SOLVED);
  SCRAMBLE.forEach((m) => c.move(m));
  return c.getFacelet();
})();

function runScene(facelets, light, opts = {}) {
  const noise = opts.noise != null ? opts.noise : 3.5;
  const samplesPerCell = opts.samplesPerCell || 9;
  const glareIdxs = opts.glareIdxs || [];
  const measured = {};
  const cells = [];
  FACES.forEach((f, fi) => {
    const seg = facelets.slice(fi * 9, fi * 9 + 9).split('');
    seg.forEach((letter, i) => {
      const globalIdx = fi * 9 + i;
      let samples = makeSamples(letter, light, noise, samplesPerCell);
      if (glareIdxs.includes(globalIdx)) {
        samples = samples.map(() => ({ r: 250, g: 250, b: 250 })); // 过曝：整格变白
      }
      cells.push({ face: f, idx: i, letter, samples, globalIdx });
    });
    measured[f] = cm.medianRgb(cells[fi * 9 + 4].samples);
  });
  const faceLetter = {};
  FACES.forEach((f) => {
    faceLetter[f] = f;
  });
  const refs = cm.refsFromCenters(measured, faceLetter);
  const whiteRef = cm.pickWhiteRef(measured, faceLetter, PALETTE);
  const calibration = cm.buildCalibration(PALETTE);

  let absOk = 0;
  let relOk = 0;
  let relOkUnflagged = 0;
  let unflagged = 0;
  let uncertain = 0;
  const flagged = [];
  cells.forEach((cell) => {
    const a = cm.classify(cell.samples, calibration);
    if (a.letter === cell.letter) absOk++;
    const r = cm.classifyRelative(cell.samples, refs, { whiteRef });
    if (r.letter === cell.letter) relOk++;
    if (r.uncertain) {
      uncertain++;
      flagged.push(cell.globalIdx);
    } else {
      unflagged++;
      if (r.letter === cell.letter) relOkUnflagged++;
    }
  });
  return { absOk, relOk, relOkUnflagged, unflagged, uncertain, flagged, total: cells.length };
}

const SCENES = [
  { name: '标准白光', light: { gain: { r: 1, g: 1, b: 1 }, bright: 1, shading: { r: 1, g: 1, b: 1 } } },
  { name: '暖光（偏黄）', light: { gain: { r: 1.12, g: 1.0, b: 0.78 }, bright: 0.95, shading: { r: 1, g: 1, b: 1 } } },
  { name: '冷光（偏蓝）', light: { gain: { r: 0.7, g: 0.95, b: 1.35 }, bright: 0.9, shading: { r: 1, g: 1, b: 1 } } },
  { name: '昏暗环境', light: { gain: { r: 1, g: 1, b: 1 }, bright: 0.45, shading: { r: 1, g: 1, b: 1 } } },
  { name: '暖光 + 昏暗', light: { gain: { r: 1.15, g: 1.0, b: 0.8 }, bright: 0.6, shading: { r: 1, g: 1, b: 1 } } }
];

describe('拍照识别（合成光照场景，54 个色块）', () => {
  const rows = SCENES.map((s) => ({ name: s.name, ...runScene(FACELETS, s.light, { noise: 3.5 }) }));
  const std = rows[0];
  const warm = rows[1];
  const cool = rows[2];
  const dim = rows[3];

  it('标准白光：绝对与相对分类都 54/54', () => {
    expect(std.absOk).toBe(std.total);
    expect(std.relOk).toBe(std.total);
  });

  it('暖光：相对分类 54/54；绝对分类确实出错（45/54，证明场景有效）', () => {
    expect(warm.relOk).toBe(warm.total);
    expect(warm.absOk).toBeLessThanOrEqual(45);
  });

  it('冷光：相对分类 54/54 且不劣于绝对分类', () => {
    expect(cool.relOk).toBe(cool.total);
    expect(cool.relOk).toBeGreaterThanOrEqual(cool.absOk);
  });

  it('昏暗：相对分类 54/54；全部场景不劣于绝对分类', () => {
    expect(dim.relOk).toBe(dim.total);
    expect(rows.every((r) => r.relOk >= r.absOk)).toBe(true);
    const gains = rows.slice(1).map((r) => r.relOk - r.absOk);
    expect(gains.filter((g) => g >= 5).length).toBeGreaterThanOrEqual(2);
  });

  it('"不确定"标记可靠：未标记的格子全部正确，干净场景误报 ≤3 格', () => {
    expect(rows.every((r) => r.unflagged === 0 || r.relOkUnflagged === r.unflagged)).toBe(true);
    expect(std.uncertain).toBeLessThanOrEqual(3);
  });

  it('强噪声（中位数抗噪）仍有高正确率 ≥50/54', () => {
    const noisy = runScene(FACELETS, SCENES[1].light, { noise: 26 });
    expect(noisy.relOk).toBeGreaterThanOrEqual(50);
  });

  it('过曝格必须被"不确定"标记命中', () => {
    const glareCells = [7, 22, 40];
    const gl = runScene(FACELETS, SCENES[0].light, { glareIdxs: glareCells });
    expect(glareCells.every((i) => gl.flagged.includes(i))).toBe(true);
  });

  it('白平衡增益把色偏扣掉；参照表按 facelet 字母组装', () => {
    const tintedWhite = { r: 255 * 1.15, g: 250 * 1.0, b: 235 * 0.8 };
    const whiteRef = cm.pickWhiteRef({ U: tintedWhite }, { U: 'U' }, PALETTE);
    const balanced = cm.whiteBalance(tintedWhite, whiteRef);
    expect(Math.abs(balanced.r - balanced.g)).toBeLessThan(1e-6);
    expect(Math.abs(balanced.g - balanced.b)).toBeLessThan(1e-6);
    const refs = cm.refsFromCenters(
      { U: IDEAL.U, D: IDEAL.D, F: IDEAL.F, B: IDEAL.B, R: IDEAL.R, L: IDEAL.L },
      { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }
    );
    expect(Object.keys(refs).length).toBe(6);
  });

  it('scanState 六面组装与校验：缺面 / 颜色数错 / 死状态 / 成功', async () => {
    const ss = await import('../src/engine/scanState.js');
    const session = ss.newScanSession();
    expect(ss.validate(session).ok).toBe(false);
    // 完整六面（用打乱态拆面）
    FACES.forEach((f, fi) => {
      ss.setFace(session, f, FACELETS.slice(fi * 9, fi * 9 + 9).split(''));
    });
    const v = ss.validate(session);
    expect(v.ok).toBe(true);
    expect(v.state).toBe(FACELETS);
    // 破坏一面：中心错（持握方向拍错）→ 提示重拍该面
    const broken = ss.newScanSession();
    FACES.forEach((f, fi) => {
      const g = FACELETS.slice(fi * 9, fi * 9 + 9).split('');
      if (f === 'L') g[4] = 'U';
      ss.setFace(broken, f, g);
    });
    const v2 = ss.validate(broken);
    expect(v2.ok).toBe(false);
    expect(v2.badFaces).toContain('L');
  });
});
