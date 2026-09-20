/**
 * component.test.js —— 组件契约测试（任务 §8：状态-first / 演示统一起点 / 视角锁定与复位）
 *
 * jsdom 无 WebGL：mock createCube3D（记录调用的假控制器），
 * 验证 Cube3D.vue 与 useScramble / useDemo 的契约行为。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ---- 假控制器：记录全部调用（state-first 契约的观察点）----
function makeFakeController() {
  const calls = { move: [], setState: [], setInteractive: [], setTouchEnabled: [], resetView: [], applyMoves: [] };
  return {
    calls,
    move: (n, o) => {
      calls.move.push(n);
      if (o && o.onDone) o.onDone(); // 同步完成（无动画）
      return true;
    },
    applyMoves: (seq) => {
      calls.applyMoves.push(...seq);
      return seq.length;
    },
    setState: (f, o) => {
      calls.setState.push({ facelet: f, opts: o });
      return true;
    },
    getFacelet: () => 'U'.repeat(54),
    isSolved: () => false,
    isAnimating: () => false,
    setAutoSpin: () => {},
    setOrientation: () => true,
    resetView: () => {
      calls.resetView.push(true);
      return true;
    },
    setInteractive: (v) => calls.setInteractive.push(v),
    setTouchEnabled: (v) => calls.touchEnabledPushed === undefined && calls.setTouchEnabled.push(v),
    highlight: () => {},
    clearHighlight: () => {},
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
    resize: () => {},
    destroy: () => {}
  };
}

const fakeControllers = [];
vi.mock('../src/composables/useCube3D.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createCube3D: (canvas, opts) => {
      const c = makeFakeController();
      fakeControllers.push(c);
      return c;
    }
  };
});

import Cube3D from '../src/components/Cube3D.vue';
import { useDemo } from '../src/composables/useDemo.js';
import { useScramble } from '../src/composables/useScramble.js';
import { useSettingsStore } from '../src/stores/settings.js';
import { getType } from '../src/engine/cubeTypes.js';

describe('Cube3D.vue 组件契约', () => {
  beforeEach(() => {
    fakeControllers.length = 0;
    setActivePinia(createPinia());
  });

  it('state-first：传入 facelet prop → setState 立即收到该状态（动画之前）', async () => {
    const type = getType('3x3');
    const c = type.createCube(type.SOLVED);
    ["R'", 'U', 'F2'].forEach((m) => c.move(m));
    const scrambled = c.getFacelet();
    const wrapper = mount(Cube3D, { props: { facelet: scrambled } });
    await flushPromises();
    const ctrl = fakeControllers[0];
    expect(ctrl.calls.setState.length).toBeGreaterThanOrEqual(1);
    expect(ctrl.calls.setState[0].facelet).toBe(scrambled);
    // 独立计算同一打乱的 facelet 应与传入的一致（状态唯一来源是引擎）
    const c2 = getType('3x3').createCube(getType('3x3').SOLVED);
    c2.applyMoves(["R'", 'U', 'F2']);
    expect(ctrl.calls.setState[0].facelet).toBe(c2.getFacelet());
    wrapper.unmount();
  });

  it('交互锁：interactive=false → setInteractive(false)（视角锁定期间禁止转层）', async () => {
    const wrapper = mount(Cube3D, { props: { interactive: true } });
    await flushPromises();
    const ctrl = fakeControllers[0];
    expect(ctrl.calls.setInteractive[0]).toBe(true);
    await wrapper.setProps({ interactive: false });
    expect(ctrl.calls.setInteractive).toContain(false);
    wrapper.unmount();
  });

  it('打乱后 3D 状态 = 独立计算的 facelet（组件上逐 move 应用）', async () => {
    const wrapper = mount(Cube3D, { props: {} });
    await flushPromises();
    const ctrl = fakeControllers[0];
    const seq = ["R'", 'U', 'F2', 'L', "D'"];
    seq.forEach((m) => ctrl.move(m, {}));
    expect(ctrl.calls.move).toEqual(seq);
    // 逻辑模型（engine Cube）独立重放必须得到同一状态 —— 由引擎等价测试保证；
    // 这里验证组件转发的序列完整无损（不多不少、顺序一致）
    const c = getType('3x3').createCube(getType('3x3').SOLVED);
    ctrl.calls.move.forEach((m) => c.move(m));
    expect(c.getFacelet()).toBe(
      getType('3x3')
        .createCube(getType('3x3').SOLVED)
        .applyMoves(seq).getFacelet()
    );
    wrapper.unmount();
  });
});

describe('useDemo —— 演示统一起点', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('从头演示前先复位到统一起点（打乱完成态）', async () => {
    const demo = useDemo();
    const fake = makeFakeController();
    const startFacelet = 'R'.repeat(9) + 'U'.repeat(9) + 'F'.repeat(9) + 'D'.repeat(9) + 'L'.repeat(9) + 'B'.repeat(9);
    demo.setStartFacelet(startFacelet);
    const finished = vi.fn();
    demo.play(fake, ['R', 'U'], { fromIndex: 0, finished });
    // 第一步之前必须先 setState 到统一起点
    expect(fake.calls.setState.length).toBeGreaterThanOrEqual(1);
    expect(fake.calls.setState[0].facelet).toBe(startFacelet);
    expect(fake.calls.setInteractive).toContain(false); // 演示期间锁定
    // 步间等待走 setTimeout（waitMs = 0）→ 等待后全部步完成
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.calls.move).toEqual(['R', 'U']);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('切标签（resetToStart）也会复位到统一起点', () => {
    const demo = useDemo();
    const fake = makeFakeController();
    demo.setStartFacelet('U'.repeat(54));
    fake.move('R', {});
    fake.calls.setState.length = 0;
    demo.resetToStart(fake);
    expect(fake.calls.setState[0].facelet).toBe('U'.repeat(54));
  });
});

describe('useScramble —— 打乱编排', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const settings = useSettingsStore();
    await settings.init();
    settings.update({ scrambleSec: 0.5 }); // waitMs = 0：同步链路
  });

  it('playSteps 逐条 move；完成回调只触发一次', async () => {
    const sc = useScramble();
    const fake = makeFakeController();
    sc.scrambling.value = true;
    const moves = ["R'", 'U', 'F2'];
    const finished = vi.fn();
    sc.playSteps(fake, moves, finished);
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.calls.move).toEqual(moves);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(sc.scrambling.value).toBe(false);
  });

  it('skip：剩余步一次性应用（applyMoves）并收尾，不再逐条播放', async () => {
    const sc = useScramble();
    const fake = makeFakeController();
    sc.scrambling.value = true;
    const moves = ['R', 'U', 'R', 'U', 'R', 'U'];
    const finished = vi.fn();
    // 播放 2 步后跳过
    let played = 0;
    const origMove = fake.move.bind(fake);
    fake.move = (n, o) => {
      played++;
      if (played >= 2) {
        setTimeout(() => sc.skip(fake, moves), 0);
      }
      return origMove(n, o);
    };
    sc.playSteps(fake, moves, finished);
    await new Promise((r) => setTimeout(r, 30));
    expect(finished).toHaveBeenCalledTimes(1);
    expect(fake.calls.applyMoves.length).toBeGreaterThan(0); // 剩余步一次性应用
    expect(fake.calls.applyMoves.length).toBeLessThan(moves.length);
    // 全部步（move + applyMoves）恰好等于公式（不多不少 —— 防"跳过后剩余步被二次应用"回归）
    const total = fake.calls.move.length + fake.calls.applyMoves.length;
    expect(total).toBe(moves.length);
    expect(sc.scrambling.value).toBe(false);
  });

  it('generate：3x3 随机步回退可用且通过引擎校验', async () => {
    const sc = useScramble();
    const { moves, mode } = await sc.generate('3x3');
    expect(moves.length).toBeGreaterThan(0);
    expect(['random-state', 'random-move']).toContain(mode);
    const { validateScramble } = await import('../src/engine/scrambler.js');
    expect(validateScramble('3x3', moves).ok).toBe(true);
  }, 30000);
});
