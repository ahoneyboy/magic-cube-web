/**
 * unit-swipe.test.js —— 滑动判定测试（复用小程序 swipe.js 的纯算法）
 * 验证：屏幕滑动 × 相机基向量 × 视角四元数 → 唯一转层记号。
 */
import { describe, it, expect } from 'vitest';
import { analyzeSwipe, decideSwipe } from '../src/composables/swipe.js';

// 默认视角（白顶绿前，相机在 +z 上方）：视角四元数为单位阵，
// 相机右 = +x、相机上 = +y（与控制器 camBasis 的构造一致）
const IDENTITY_VIEW = {
  viewQuat: [0, 0, 0, 1],
  camRight: [1, 0, 0],
  camUp: [0, 1, 0]
};

describe('滑动 → 转层判定（swipe.js）', () => {
  it('URF 角块的 U 面贴纸右滑 → F（顺时针，高分且明确）', () => {
    const r = analyzeSwipe({
      ...IDENTITY_VIEW,
      pos: [1, 1, 1],
      stickerLocal: [1, 1.5, 1], // U 面贴纸触点
      swipe: [100, 0],
      allowSlices: false,
      n: 3
    });
    expect(r.notation).toBe('F');
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it('同一贴纸右滑在禁用中层时结果不变', () => {
    const r = analyzeSwipe({
      ...IDENTITY_VIEW,
      pos: [1, 1, 1],
      stickerLocal: [1, 1.5, 1],
      swipe: [100, 0],
      allowSlices: false,
      n: 3
    });
    expect(r.notation).toBe('F');
  });

  it('前中心贴纸右滑 → E（E 层顺时针，跟随 D 方向）；禁中层时无法判定', () => {
    const base = {
      ...IDENTITY_VIEW,
      pos: [0, 0, 1],
      stickerLocal: [0, 0, 1.5],
      swipe: [100, 0],
      n: 3
    };
    expect(analyzeSwipe({ ...base, allowSlices: true }).notation).toBe('E');
    expect(analyzeSwipe({ ...base, allowSlices: false })).toBeNull();
  });

  it('视角旋转 90°（绕 y）后，同一贴纸同一滑动仍判定为合法外层记号（与小程序同口径）', () => {
    // 视角绕 y 转 +90°：q = [0, sin45°, 0, cos45°]
    const s = Math.SQRT1_2;
    const r = analyzeSwipe({
      viewQuat: [0, s, 0, s],
      camRight: [1, 0, 0],
      camUp: [0, 1, 0],
      pos: [1, 1, 1],
      stickerLocal: [1, 1.5, 1],
      swipe: [100, 0],
      allowSlices: false,
      n: 3
    });
    // 与小程序 features.test.js 相同的契约：旋转视角下仍映射为单个外层 90° 记号、高置信
    expect(r.notation).toMatch(/^[URFDLB]('?|2)?$/);
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it('decideSwipe：分数低于阈值不动作（阈值语义）', () => {
    const base = {
      ...IDENTITY_VIEW,
      pos: [1, 1, 1],
      stickerLocal: [1, 1.5, 1],
      swipe: [100, 0],
      allowSlices: false,
      n: 3
    };
    // 默认阈值 0.5：明确滑动触发
    expect(decideSwipe({ ...base })).toBe('F');
    // 阈值高于实际分数：宁可不转（不猜）
    expect(decideSwipe({ ...base, minScore: 1.1 })).toBeNull();
  });
});
