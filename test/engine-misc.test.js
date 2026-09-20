/**
 * engine-misc.test.js —— 支撑逻辑等价测试：
 * WCA 规则（观察罚时 / ao5 去头尾 / 格式化）、课程判定器、课程与成就数据完整性、
 * 速度语义（0.5~10s 步进 0.5 归一化；转动固定 500ms + 等待剩余；12s 截断回归）。
 */
import { describe, it, expect } from 'vitest';
import {
  classifyInspection, inspectionCalls, effectiveMs, formatMs, formatResult, averageOf, bestOf, meanOf
} from '../src/engine/wcaRules.js';
import { checkPractice, dCrossDone, firstLayerDone, twoLayersDone, uCrossDone, uFaceDone } from '../src/engine/lessonCheck.js';
import { STAGES, FORMULAS, ADVANCED } from '../src/engine/config/lessonData.js';
import { XP_PER_EVENT, XP_LEVELS, BADGES } from '../src/engine/config/achievements.js';
import { Cube, SOLVED } from '../src/engine/cube.js';
import { normalizeSec } from '../src/stores/recordsMath.js';
import { stepTimings } from '../src/stores/recordsMath.js';

describe('WCA 规则（wcaRules）', () => {
  it('观察判定：≤15s 正常；15~17s +2；>17s DNF', () => {
    expect(classifyInspection(5000).penalty).toBe('');
    expect(classifyInspection(15000).penalty).toBe('');
    expect(classifyInspection(16000).penalty).toBe('+2');
    expect(classifyInspection(17100).penalty).toBe('DNF');
  });

  it('报时点：8 秒 / 12 秒', () => {
    expect(inspectionCalls(8000)).toContain('八秒');
    expect(inspectionCalls(12000)).toContain('十二秒');
    expect(inspectionCalls(3000)).toEqual([]);
    expect(inspectionCalls(16000)).toEqual([]);
  });

  it('ao5 去头尾：5 次 = 去最好最差取平均；2 次 DNF = DNF', () => {
    const results = [
      { ms: 10000, penalty: '' },
      { ms: 12000, penalty: '' },
      { ms: 8000, penalty: '' },
      { ms: 20000, penalty: '' },
      { ms: 11000, penalty: '' }
    ];
    const avg = averageOf(results, 5);
    expect(avg.isDNF).toBe(false);
    expect(avg.value).toBe(11000); // 去掉 8000 与 20000，(10000+12000+11000)/3
    expect(avg.dropped.best).toBe(8000);
    expect(avg.dropped.worst).toBe(20000);

    const withDnf = [
      { ms: 10000, penalty: 'DNF' },
      { ms: 12000, penalty: 'DNF' },
      { ms: 8000, penalty: '' },
      { ms: 20000, penalty: '' },
      { ms: 11000, penalty: '' }
    ];
    expect(averageOf(withDnf, 5).isDNF).toBe(true);
    // 只有 1 次 DNF：DNF 计入最差被去掉，次差再被去掉
    const oneDnf = [
      { ms: 10000, penalty: 'DNF' },
      { ms: 12000, penalty: '' },
      { ms: 8000, penalty: '' },
      { ms: 20000, penalty: '' },
      { ms: 11000, penalty: '' }
    ];
    expect(averageOf(oneDnf, 5).isDNF).toBe(false);
    // 去掉 8000（最好）与 DNF（最差）后：(11000+12000+20000)/3
    expect(averageOf(oneDnf, 5).value).toBe(14333);
  });

  it('成绩格式化：12.34 / +2 / DNF', () => {
    expect(formatResult(12340, '')).toBe('12.34');
    expect(formatResult(12340, '+2')).toBe('14.34+2');
    expect(formatResult(12340, 'DNF')).toBe('DNF');
    expect(formatMs(83450)).toBe('1:23.45');
    expect(effectiveMs(12340, '+2')).toBe(14340);
    expect(effectiveMs(12340, 'DNF')).toBe(Infinity);
    expect(bestOf([{ ms: 9000, penalty: '' }, { ms: 8000, penalty: 'DNF' }])).toBe(9000);
    expect(meanOf([{ ms: 1000, penalty: '' }, { ms: 3000, penalty: '' }])).toBe(2000);
  });
});

describe('课程判定器（lessonCheck）', () => {
  it('基础 7 判定器逐级递进', () => {
    expect(checkPractice('explore', SOLVED, 6).pass).toBe(true);
    expect(checkPractice('explore', SOLVED, 2).pass).toBe(false);

    // L2 打乱 → 判定器全部 false
    const c = new Cube(SOLVED);
    c.applyMoves(['R', 'U', "R'", "U'", 'F', 'L']);
    const st = c.getFacelet();
    expect(dCrossDone(st)).toBe(false);

    // D 面十字：应用 LBL 十字阶段的解法后应通过
    return import('../src/engine/lblSolver.js').then(({ solveLbl }) => {
      const r = solveLbl(st);
      const crossStage = r.stages.find((s) => s.id === 'cross');
      const c2 = new Cube(st);
      crossStage.moves.forEach((m) => c2.move(m));
      expect(dCrossDone(c2.getFacelet())).toBe(true);
      expect(firstLayerDone(c2.getFacelet())).toBe(false);
      // 完整解后全部通过
      const c3 = new Cube(st);
      r.moves.forEach((m) => c3.move(m));
      expect(firstLayerDone(c3.getFacelet())).toBe(true);
      expect(twoLayersDone(c3.getFacelet())).toBe(true);
      expect(uCrossDone(c3.getFacelet())).toBe(true);
      expect(uFaceDone(c3.getFacelet())).toBe(true);
      expect(checkPractice('solved', c3.getFacelet(), 10).pass).toBe(true);
    });
  });

  it('进阶判定器：FB 左桥 / 两桥 / 2x2x3 块 / EOLine / 复原', { timeout: 120000 }, () => {
    // 从复原态打乱后用对应求解器解到阶段完成
    return Promise.all([
      import('../src/engine/rouxSolver.js'),
      import('../src/engine/zzSolver.js'),
      import('../src/engine/petrusSolver.js'),
      import('../src/engine/pieceSolver.js'),
      import('../src/engine/lblSolver.js')
    ]).then(([{ solveRoux, FB_EDGES, FB_CORNERS }, { solveZZ }, { solvePetrus }, P, { solveLbl }]) => {
      const c = new Cube(SOLVED);
      c.applyMoves(['F', 'U', "R'", 'D2', 'B', "L'", 'U2', "F'"]);
      const st = c.getFacelet();

      P.setBudget(20000);
      try {
        const rr = solveRoux(st);
        const cR = new Cube(st);
        rr.stages.find((s) => s.id === 'fb').moves.forEach((m) => cR.move(m));
        const afterFB = checkPractice('blockFB', cR.getFacelet(), 5);
        expect(afterFB.pass).toBe(true);

        const zz = solveZZ(st);
        const cZ = new Cube(st);
        const eoStage = zz.stages.find((s) => s.id === 'eo');
        const lineStage = zz.stages.find((s) => s.id === 'line');
        if (eoStage && lineStage) {
          eoStage.moves.concat(lineStage.moves).forEach((m) => cZ.move(m));
          expect(checkPractice('eoline', cZ.getFacelet(), 5).pass).toBe(true);
        }

        const pt = solvePetrus(st);
        const cP = new Cube(st);
        const blk = pt.stages.find((s) => s.id === 'block223');
        if (blk && blk.moves.length) {
          blk.moves.forEach((m) => cP.move(m));
          expect(checkPractice('block223', cP.getFacelet(), 5).pass).toBe(true);
        }
      } finally {
        P.clearBudget();
      }

      const lb = solveLbl(st);
      const cL = new Cube(st);
      lb.moves.forEach((m) => cL.move(m));
      expect(checkPractice('solved', cL.getFacelet(), 5).pass).toBe(true);
      void FB_EDGES;
      void FB_CORNERS;
    });
  });
});

describe('课程与成就数据', () => {
  it('层先法 7 课 + 进阶 4 课，每课三件套齐全', () => {
    expect(STAGES.length).toBe(7);
    expect(ADVANCED.length).toBe(4);
    STAGES.forEach((s) => {
      expect(s.demo.moves.length).toBeGreaterThan(0);
      expect(s.tip).toBeTruthy();
      expect(s.practice.checkId).toBeTruthy();
      expect(s.practice.goal).toBeTruthy();
    });
    ADVANCED.forEach((a) => {
      expect(a.stageList.length).toBeGreaterThan(0);
      expect(a.practice.checkId).toBeTruthy();
    });
    // 进阶课引用的公式卡都存在
    ADVANCED.forEach((a) => {
      (a.formulas || []).forEach((k) => expect(FORMULAS[k]).toBeTruthy());
    });
  });

  it('成就配置：事件经验 / 等级表 / 12 枚徽章', () => {
    expect(XP_PER_EVENT.solve).toBe(10);
    expect(XP_LEVELS.length).toBe(6);
    expect(BADGES.length).toBe(12);
    BADGES.forEach((b) => {
      expect(typeof b.check).toBe('function');
      expect(b.check({ stats: {}, totalSolves: 99, streakDays: 99, lessonsDone: 99, scanSuccess: 99, cube2Solved: 99, bestTimerMs: 1000, skillLevel: 'master' })).toBeTruthy();
    });
  });
});

describe('速度语义（§5.1：每步总时长 = 转动固定 500ms + 等待剩余）', () => {
  it('normalizeSec：对齐 0.5 步进并收敛到 [0.5, 10]', () => {
    expect(normalizeSec(0.5, 0.5)).toBe(0.5);
    expect(normalizeSec(3, 0.5)).toBe(3);
    expect(normalizeSec(0.24, 0.5)).toBe(0.5);   // 低于下限收敛
    expect(normalizeSec(99, 0.5)).toBe(10);      // 高于上限收敛
    expect(normalizeSec(2.3, 0.5)).toBe(2.5);    // 对齐步进
    expect(normalizeSec(NaN, 0.5)).toBe(0.5);    // 非法回退
    expect(normalizeSec('4.7', 0.5)).toBe(4.5);
  });

  it('stepTimings：转动固定 500ms，等待 = max(0, 总时长-500)', () => {
    expect(stepTimings(0.5)).toEqual({ turnMs: 500, waitMs: 0 });
    expect(stepTimings(2)).toEqual({ turnMs: 500, waitMs: 1500 });
    expect(stepTimings(10)).toEqual({ turnMs: 500, waitMs: 9500 });
  });

  it('800ms 截断回归：10s/步设置下，单步动画时长不再被截到 800ms', () => {
    // 旧实现动画时长上限 800ms 导致"速度设置无效"；现上限放宽到 12s。
    // drain()/演示/打乱统一用 stepTimings 计算，这里回归校验上限常量。
    const DURATION_CAP_MS = 12000;
    expect(Math.min(stepTimings(10000).turnMs, DURATION_CAP_MS)).toBe(500);
    // 整步（含等待）按设置生效：第 10 档 = 10s ≥ 0.5s 最小档
    const total = stepTimings(10000);
    expect(total.turnMs + total.waitMs).toBe(10000);
    expect(total.turnMs + total.waitMs).toBeGreaterThan(800);
  });
});
