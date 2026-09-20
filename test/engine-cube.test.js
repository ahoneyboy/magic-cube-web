/**
 * engine-cube.test.js —— 状态模型等价测试（与小程序 test/cube.test.js 同口径）
 * 54 位 facelet / 转动记号 / 中层与宽层 / 可解性校验。
 */
import { describe, it, expect } from 'vitest';
import {
  Cube, FACES, SOLVED, QUARTER, QUARTER_SLICE, QUARTER_WIDE,
  validateState, parseSequence, invertMove, invertSequence, isSolvedUpToRotation
} from '../src/engine/cube.js';
import { analyzeState, pieceArrays, CORNERS, EDGES } from '../src/engine/cubies.js';

describe('状态模型（cube.js）', () => {
  it('复原态常量与基础校验', () => {
    expect(SOLVED).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
    expect(FACES).toEqual(['U', 'R', 'F', 'D', 'L', 'B']);
    expect(validateState(SOLVED).ok).toBe(true);
    expect(validateState('UUU').ok).toBe(false);
    expect(validateState('U'.repeat(53) + 'X').ok).toBe(false);
    expect(validateState('U'.repeat(10) + 'R'.repeat(8) + 'F'.repeat(9) + 'D'.repeat(9) + 'L'.repeat(9) + 'B'.repeat(9)).ok).toBe(false);
  });

  it('转动置换表齐全（6 面 + 3 中层 + 6 宽层）', () => {
    expect(Object.keys(QUARTER).sort()).toEqual(['B', 'D', 'F', 'L', 'R', 'U']);
    expect(Object.keys(QUARTER_SLICE).sort()).toEqual(['E', 'M', 'S']);
    expect(Object.keys(QUARTER_WIDE).sort()).toEqual(['b', 'd', 'f', 'l', 'r', 'u']);
  });

  it('同一面转动 4 次回到原态；任意序列逆序逆转回原态', () => {
    for (const f of FACES) {
      const c = new Cube(SOLVED);
      for (let i = 0; i < 4; i++) c.move(f);
      expect(c.getFacelet()).toBe(SOLVED);
    }
    const seq = parseSequence("R U R' U' F2 D L' B2 M E S r u'");
    const c = new Cube(SOLVED);
    c.applyMoves(seq);
    c.applyMoves(invertSequence(seq));
    expect(c.getFacelet()).toBe(SOLVED);
  });

  it('逆记号：R ↔ R\'，R2 不变', () => {
    expect(invertMove('R')).toBe("R'");
    expect(invertMove("R'")).toBe('R');
    expect(invertMove('R2')).toBe('R2');
  });

  it('非法记号抛错（含错误码）', () => {
    const c = new Cube(SOLVED);
    expect(() => c.move('X')).toThrowError();
    try {
      c.move('X');
    } catch (e) {
      expect(e.code).toBe('CUBE_MOVE_BAD_NOTATION');
    }
  });

  it('视觉复原（整体旋转也算复原）', () => {
    expect(isSolvedUpToRotation(SOLVED)).toBe(true);
    const c = new Cube(SOLVED);
    ["R", "M'", "L'"].forEach((m) => c.move(m)); // 整体旋转（绕 x 轴）：每面仍同色
    expect(c.isSolved()).toBe(false);
    expect(isSolvedUpToRotation(c.getFacelet())).toBe(true);
    const d = new Cube(SOLVED);
    d.move('M'); // 单个中层转动：U 面混色，不算复原
    expect(isSolvedUpToRotation(d.getFacelet())).toBe(false);
  });

  it('块级可解性：合法状态通过，死状态被拦截', () => {
    const c = new Cube(SOLVED);
    c.applyMoves("R U R' U' F2 D L' B2".split(' '));
    expect(analyzeState(c.getFacelet()).ok).toBe(true);

    // 单独翻一条棱 → FLIP
    const flip = c.getFacelet().split('');
    const e = EDGES[0];
    const t = flip[e.facelets[0]];
    flip[e.facelets[0]] = flip[e.facelets[1]];
    flip[e.facelets[1]] = t;
    const r = analyzeState(flip.join(''));
    expect(r.ok).toBe(false);

    // 中心块非标准 → CENTERS
    const centers = c.getFacelet().split('');
    centers[4] = 'D';
    centers[31] = 'U';
    const r2 = analyzeState(centers.join(''));
    expect(r2.ok).toBe(false);
    expect(r2.code).toBe('CUBE_UNSOLVABLE_CENTERS');
  });

  it('pieceArrays 与 analyzeState 一致（随机 20 例）', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let k = 0; k < 20; k++) {
      const c = new Cube(SOLVED);
      let last = '';
      for (let i = 0; i < 25; i++) {
        let f;
        do {
          f = FACES[Math.floor(rnd() * 6)];
        } while (f === last);
        last = f;
        c.move(f + ['', "'", '2'][Math.floor(rnd() * 3)]);
      }
      const pa = pieceArrays(c.getFacelet());
      expect(pa.cp.length).toBe(8);
      expect(pa.ep.length).toBe(12);
      expect(CORNERS.length).toBe(8);
      expect(EDGES.length).toBe(12);
    }
  });
});
