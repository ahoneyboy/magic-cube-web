/**
 * engine-methods.test.js —— 解法引擎等价测试（与小程序 test/methods.test.js 同口径）
 *
 * 任务 §8 要求：20 例随机打乱 × {层先法/CFOP/CFOP+ZBLL/Roux/ZZ/Petrus/盲拧}
 * 全部复原且回放一致；转动化简不改变最终状态。
 */
import { describe, it, expect } from 'vitest';
import { Cube, SOLVED } from '../src/engine/cube.js';
import { solveLbl } from '../src/engine/lblSolver.js';
import { solveCFOP } from '../src/engine/cfopSolver.js';
import { solveRoux } from '../src/engine/rouxSolver.js';
import { solveZZ, eoMaskOf, ZEO_MASK } from '../src/engine/zzSolver.js';
import { solvePetrus } from '../src/engine/petrusSolver.js';
import * as ADV from '../src/engine/advancedMethods.js';
import { METHODS } from '../src/engine/advancedMethods.js';
import * as P from '../src/engine/pieceSolver.js';
import { simplifySequence, simplifyStages, optimizeStages } from '../src/engine/moveOpt.js';
import { buildExplain } from '../src/engine/solveExplain.js';

// 确定性伪随机（与小程序测试同款 LCG，可复现）
let seed = 20240919;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function randomScramble(n) {
  const moves = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
  const out = [];
  let prev = '';
  for (let i = 0; i < n; i++) {
    let m;
    do {
      m = moves[Math.floor(rnd() * 18)];
    } while (m[0] === prev);
    prev = m[0];
    out.push(m);
  }
  return out;
}
function scrambledFacelet(n) {
  const c = new Cube(SOLVED);
  randomScramble(n || 25).forEach((m) => c.move(m));
  return c.getFacelet();
}
function applyTo(facelet, moves) {
  const c = new Cube(facelet);
  moves.forEach((m) => c.move(m));
  return c.getFacelet();
}

const N_CASES = 20;

describe('八种解法 × 20 例随机打乱（全部复原且回放一致）', () => {
  it('层先法 solveLbl：20 例复原 + 7 阶段结构', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            const r = solveLbl(f);
      expect(r.moves.length, `case ${i}`).toBeGreaterThan(0);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
      expect(r.stages.map((s) => s.id)).toEqual([
        'cross', 'corners', 'middle', 'ucross', 'uface', 'uperm-corners', 'uperm-edges'
      ]);
      // 阶段拼接 === 整条序列
      const concat = r.stages.reduce((a, s) => a.concat(s.moves), []);
      expect(concat.join(' ')).toBe(r.moves.join(' '));
      // 各阶段 from 偏移正确
      let cursor = 0;
      r.stages.forEach((s) => {
        expect(s.from).toBe(cursor);
        cursor += s.moves.length;
      });
    }
  }, 300000);

  it('CFOP solveCFOP：20 例复原', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            const r = solveCFOP(f);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
      expect(r.solved).toBe(true);
    }
  }, 300000);

  it('CFOP+ZBLL solveCFOP(f,{zbll:true})：20 例复原 + 接口形状', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            const r = solveCFOP(f, { zbll: true });
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
      expect(r).toHaveProperty('stages');
      expect(r).toHaveProperty('zbll');
    }
  }, 300000);

  it('Roux solveRoux：20 例复原（含通用收尾兜底）', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            P.setBudget(5000);
      const r = solveRoux(f);
      P.clearBudget();
      expect(r, `case ${i}`).toBeTruthy();
      expect(r.solved, `case ${i}`).toBe(true);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
    }
  }, 300000);

  it('ZZ solveZZ：20 例复原；完整解 EOLine 后 EO 全对', async () => {
    let sawFull = false;
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            P.setBudget(5000);
      const r = solveZZ(f);
      P.clearBudget();
      expect(r, `case ${i}`).toBeTruthy();
      expect(r.solved, `case ${i}`).toBe(true);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
      if (!r.fallback) {
        sawFull = true;
        const ids = r.stages.map((s) => s.id);
        expect(ids).toContain('eo');
        expect(ids).toContain('line');
        const eoMoves = r.stages[0].moves.concat(r.stages[1].moves);
        expect(eoMaskOf(applyTo(f, eoMoves))).toBe(ZEO_MASK);
        const f2lMoves = r.stages.filter((s) => s.id.indexOf('f2l') === 0).reduce((a, s) => a.concat(s.moves), []);
        expect(f2lMoves.every((m) => 'RULD'.indexOf(m[0]) >= 0)).toBe(true);
      }
    }
    expect(sawFull).toBe(true);
  }, 300000);

  it('Petrus solvePetrus：20 例复原', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            P.setBudget(5000);
      const r = solvePetrus(f);
      P.clearBudget();
      expect(r, `case ${i}`).toBeTruthy();
      expect(r.solved, `case ${i}`).toBe(true);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
    }
  }, 300000);

  it('盲拧 solveBlind：20 例复原 + memo 字母编码', async () => {
    for (let i = 0; i < N_CASES; i++) {
      await new Promise((r) => setTimeout(r, 0)); // 让出事件循环，保持 Vitest worker RPC 心跳
      const f = scrambledFacelet(25);
            P.setBudget(3500);
      const r = ADV.solveAdvanced(f, 'blind');
      P.clearBudget();
      expect(r, `case ${i}`).toBeTruthy();
      expect(r.solved, `case ${i}`).toBe(true);
      expect(applyTo(f, r.moves), `case ${i}`).toBe(SOLVED);
      expect(r.memo, `case ${i}`).toBeTruthy();
      expect(typeof r.memo.edgeText).toBe('string');
      expect(typeof r.memo.cornerText).toBe('string');
      expect(r.stages.some((s) => s.id === 'blind-edges')).toBe(true);
      expect(r.stages.some((s) => s.id === 'blind-corners')).toBe(true);
    }
  }, 300000);

  it('ADV.solveAdvanced 统一入口（roux/zz/petrus/blind）：全部复原且如实标注', async () => {
    for (const method of ['roux', 'zz', 'petrus', 'blind']) {
      for (let i = 0; i < 5; i++) {
        const f = scrambledFacelet(25);
              P.setBudget(method === 'blind' ? 3500 : 5000);
        const r = ADV.solveAdvanced(f, method);
        P.clearBudget();
        expect(r.solved, `${method} case ${i}`).toBe(true);
        expect(applyTo(f, r.moves)).toBe(SOLVED);
        expect(typeof r.fallback).toBe('boolean');
        // 降级路径必须标注 lbl-tail 阶段（如实标注）
        if (r.fallback) {
          expect(r.stages.some((s) => s.id === 'lbl-tail'), `${method} case ${i} 兜底标注`).toBe(true);
        }
      }
    }
    expect(METHODS.map((m) => m.id)).toEqual(['roux', 'zz', 'petrus', 'blind']);
  }, 300000);
});

describe('转动化简（moveOpt）', () => {
  it('局部代数化简', async () => {
    expect(simplifySequence(['R', "R'"]).length).toBe(0);
    expect(simplifySequence(['R', 'R']).join(' ')).toBe('R2');
    expect(simplifySequence(['R2', 'R2']).length).toBe(0);
    expect(simplifySequence(['R', 'L', "R'"]).join(' ')).toBe('L');
    expect(simplifySequence(['U', 'D', "U'"]).join(' ')).toBe('D');
  });

  it('跨阶段化简同步修正阶段归属', async () => {
    const simp = simplifyStages(['F', 'R', "R'", 'U'], [
      { id: 'a', from: 0, moves: ['F', 'R'] },
      { id: 'b', from: 2, moves: ["R'", 'U'] }
    ]);
    expect(simp.moves.join(' ')).toBe('F U');
    expect(simp.stages[0].from).toBe(0);
    expect(simp.stages[1].from).toBe(1);
  });

  it('20 例：optimizeStages 不改变最终状态（保状态删步）', async () => {
    for (let i = 0; i < 20; i++) {
      const start = scrambledFacelet(20);
      const seq = randomScramble(40);
      const stages = [
        { id: 'a', title: 'A', from: 0, moves: seq.slice(0, 18) },
        { id: 'b', title: 'B', from: 18, moves: seq.slice(18) }
      ];
      const before = applyTo(start, seq);
      const opt = optimizeStages(start, seq, stages);
      const after = applyTo(start, opt.moves);
      expect(after, `case ${i}`).toBe(before);
      // 阶段拼接仍等于整条序列
      const concat = opt.stages.reduce((a, s) => a.concat(s.moves), []);
      expect(concat.join(' ')).toBe(opt.moves.join(' '));
    }
  });
});

describe('本次解法说明（solveExplain）', () => {
  it('buildExplain 生成 idea + steps', async () => {
    const f = scrambledFacelet(25);
          const r = solveCFOP(f);
    const ex = buildExplain('cfop', r.stages, { total: r.moves.length, pllName: r.pllOneLookName });
    expect(ex.idea).toContain('思路');
    expect(ex.steps).toContain('本次');
    expect(ex.steps).toContain('Cross');

    const bl = ADV.solveAdvanced(f, 'blind');
    const exb = buildExplain('blind', bl.stages, { total: bl.moves.length, memo: bl.memo });
    expect(exb.steps).toContain('编码');
  });
});
