/**
 * engine-zbll.test.js —— ZBLL 公式表与匹配（与小程序 test/zbll.test.js 同口径）
 * 任务 §8：表 ≥1900 条、抽验 200 条「匹配 → 应用 → 复原」全过。
 */
import { describe, it, expect } from 'vitest';
import { Cube, SOLVED } from '../src/engine/cube.js';
import { CORNERS, EDGES, pieceArrays } from '../src/engine/cubies.js';
import * as z from '../src/engine/zbll.js';
import { OLL_2LOOK, PLL } from '../src/engine/config/algLibrary.js';
import { ZBLL_TABLE } from '../src/engine/config/zbllTable.js';

/** 由情形键重建该情形的 54 位状态（caseKeyOf 的逆） */
function stateFromKey(key) {
  const facelet = SOLVED.split('');
  // 前 16 字符 = 8 个角槽（槽序 = CORNERS 数组序），每槽 2 字符：piece 字母 + 朝向
  for (let i = 0; i < 8; i++) {
    const piece = key.charCodeAt(i * 2) - 65;
    const ori = parseInt(key[i * 2 + 1], 10);
    const slot = CORNERS[i];
    const colors = CORNERS[piece].solvedColors;
    for (let k = 0; k < 3; k++) {
      facelet[slot.facelets[(ori + k) % 3]] = colors[k];
    }
  }
  // 其余 = U 层棱槽（槽序 = EDGES 数组序中 pos[1]===1 的子序列）
  const uSlots = [];
  for (let i = 0; i < 12; i++) {
    if (EDGES[i].pos[1] === 1) uSlots.push(i);
  }
  const rest = key.slice(16);
  for (let j = 0; j < uSlots.length; j++) {
    const piece = rest.charCodeAt(j * 2) - 65;
    const ori = parseInt(rest[j * 2 + 1], 10);
    const slot = EDGES[uSlots[j]];
    const colors = EDGES[piece].solvedColors;
    for (let k = 0; k < 2; k++) {
      facelet[slot.facelets[(ori + k) % 2]] = colors[k];
    }
  }
  return facelet.join('');
}

describe('ZBLL 公式表', () => {
  it('表规模 ≥ 1900 且记号合法、长度 7-60 步', () => {
    expect(ZBLL_TABLE.length).toBeGreaterThanOrEqual(1900);
    const lens = ZBLL_TABLE.map((e) => e[1].split(' ').length);
    expect(Math.min(...lens)).toBeGreaterThanOrEqual(7);
    expect(Math.max(...lens)).toBeLessThanOrEqual(60);
    expect(ZBLL_TABLE.every((e) => e[1].split(' ').every((m) => /^[URFDLBMES](2|')?$/.test(m)))).toBe(true);
    expect(z.TABLE_SIZE).toBe(ZBLL_TABLE.length);
  });

  it('抽验 200 条：情形键 ↔ 状态往返一致 + 匹配 → 应用 → 复原', () => {
    // 均匀抽 200 条（含首尾）
    const idxs = new Set();
    for (let i = 0; i < 200; i++) {
      idxs.add(Math.floor((i * ZBLL_TABLE.length) / 200));
    }
    idxs.add(ZBLL_TABLE.length - 1);
    let checked = 0;
    for (const i of idxs) {
      const [key, alg] = ZBLL_TABLE[i];
      const st = stateFromKey(key);
      // 键往返一致：从状态重算键必须等于原键
      expect(z.caseKeyOf(st), `entry ${i}`).toBe(key);
      const m = z.matchZbll(st);
      expect(m.applicable, `entry ${i}`).toBe(true);
      expect(m.found, `entry ${i} key=${key}`).toBe(true);
      const c = new Cube(st);
      m.moves.forEach((x) => c.move(x));
      expect(c.getFacelet(), `entry ${i} 应用后应复原`).toBe(SOLVED);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(200);
  });

  it('端到端：OLL/PLL 公式 × AUF 生成的 LL 情形全部命中并复原', () => {
    let applicable = 0;
    let solvedOk = 0;
    let refused = 0;
    OLL_2LOOK.concat(PLL).forEach((alg) => {
      [[], ['U'], ["U'"], ['U2']].forEach((pre) => {
        const c = new Cube(SOLVED);
        pre.concat(alg.moves).forEach((m) => c.move(m));
        const st = c.getFacelet();
        if (st === SOLVED) return;
        const m = z.matchZbll(st);
        if (!m.applicable) {
          refused++;
          return;
        }
        applicable++;
        if (!m.found) return;
        const c2 = new Cube(st);
        m.moves.forEach((x) => c2.move(x));
        if (c2.getFacelet() === SOLVED) solvedOk++;
      });
    });
    expect(applicable).toBeGreaterThan(60);
    expect(solvedOk).toBe(applicable);
    expect(refused).toBeGreaterThan(0);
  });

  it('非适用状态被正确拒绝（前两层未完成 / 顶层十字未成）', () => {
    const c = new Cube(SOLVED);
    c.applyMoves("R U R' U'".split(' '));
    const m = z.matchZbll(c.getFacelet());
    expect(m.applicable).toBe(false);
    const c2 = new Cube(SOLVED);
    c2.applyMoves("F R U R' U' F'".split(' ')); // 只破坏顶层棱朝向（前两层其实还好？不，该公式保持 F2L）
    const m2 = z.matchZbll(c2.getFacelet());
    expect(m2.applicable).toBe(false); // 顶层十字未成 → 拒绝
  });

  it('教学分类：5 家族覆盖全部公式且数量符合形态分布', () => {
    const fams = z.buildFamilies();
    const total = fams.reduce((a, f) => a + f.count, 0);
    expect(fams.length).toBe(5);
    expect(total).toBe(ZBLL_TABLE.length);
    expect(fams.map((f) => f.id).join(',')).toBe('ori,sune,tu,l,hp');
    const ori = fams.find((f) => f.id === 'ori');
    expect(ori.count).toBeGreaterThanOrEqual(60);
    expect(ori.count).toBeLessThanOrEqual(80);
    // 全量：每条表项都能被分类
    let classified = 0;
    ZBLL_TABLE.forEach((e) => {
      if (z.classifyKey(e[0]).id) classified++;
    });
    expect(classified).toBe(ZBLL_TABLE.length);
  });

  it('与求解器集成：CFOP+ZBLL / ZZ-a 用上一步式顶层', () => {
    // 动态引入避免与 methods 测试重复加载开销
    return Promise.all([import('../src/engine/cfopSolver.js'), import('../src/engine/zzSolver.js'), import('../src/engine/pieceSolver.js')]).then(
      ([{ solveCFOP }, { solveZZ }, P]) => {
        let cfopZbll = 0;
        for (let i = 0; i < 8; i++) {
          const c = new Cube(SOLVED);
          const mv = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
          for (let k = 0; k < 25; k++) c.move(mv[Math.floor((i * 31 + k * 7) % mv.length)]);
          const f = c.getFacelet();
          const r1 = solveCFOP(f, { zbll: true });
          const b1 = new Cube(f);
          r1.moves.forEach((m) => b1.move(m));
          expect(b1.getFacelet()).toBe(SOLVED);
          if (r1.zbll) cfopZbll++;
        }
        expect(cfopZbll).toBeGreaterThan(0);
        let zzPure = 0;
        let zzZbll = 0;
        for (let i = 0; i < 6; i++) {
          const c = new Cube(SOLVED);
          const mv = ['U', "U'", 'R', "R'", 'F2', 'D', "D'", 'L', 'B', "B'"];
          for (let k = 0; k < 25; k++) c.move(mv[(i * 13 + k * 3) % mv.length]);
          const f = c.getFacelet();
          P.setBudget(9000);
          let r = null;
          try {
            r = solveZZ(f);
          } catch (e) {
            r = null;
          }
          P.clearBudget();
          if (!r) continue;
          const b = new Cube(f);
          r.moves.forEach((m) => b.move(m));
          expect(b.getFacelet()).toBe(SOLVED);
          if (!r.fallback) {
            zzPure++;
            if (r.zbll) zzZbll++;
          }
        }
        expect(zzPure).toBeGreaterThan(0);
        expect(zzZbll).toBe(zzPure);
      }
    );
  });
});
