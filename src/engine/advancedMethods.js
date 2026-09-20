/**
 * advancedMethods.js —— 高级解法统一入口（Roux / ZZ / Petrus / 盲拧）
 *
 * 每个方法都返回统一的 { moves, stages, solved, ... } 结构，
 * 供"看解法"面板的标签页直接展示；盲拧额外返回字母编码（memo）。
 *
 * 求解失败会抛出带 code 的错误（如 ROUX_FAIL），调用方按"该方法暂时没找到解"处理。
 * 不依赖 wx / DOM，可在 Node 与 Worker 中通用。
 */



import * as Blind from './blindSolver.js';
import * as moveOpt from './moveOpt.js';
import * as Petrus from './petrusSolver.js';
import * as Roux from './rouxSolver.js';
import { buildExplain } from './solveExplain.js';
import * as ZZ from './zzSolver.js';
const METHODS = [
  {
    id: 'roux',
    name: '桥式 Roux',
    emoji: '🌉',
    desc: '左右各搭一个 1×2×3 的"桥"，顶层角块一次归位，最后用 M/U 收掉六条棱',
    hint: '公式少、转动幅度小，很适合单手；难点是观察'
  },
  {
    id: 'zz',
    name: 'ZZ 法',
    emoji: '⚡',
    desc: '先把 12 条棱的朝向全部调正（EOLine），之后只用 R/U/L 完成前两层',
    hint: '不用翻棱、转体少；难点是 EOLine 的观察'
  },
  {
    id: 'petrus',
    name: 'Petrus',
    emoji: '🧱',
    desc: '先拼 2×2×3 大方块，再修棱朝向，然后补齐剩余部分',
    hint: '块构建自由度高、公式量小；难点是边搭边观察'
  },
  {
    id: 'blind',
    name: '盲拧',
    emoji: '🙈',
    desc: '不靠眼睛，靠字母编码记住每一块的位置，用纯三循环公式逐块归位（彳亍法同源）',
    hint: '先背字母串，再闭眼复原'
  }
];

function methodMeta(id) {
  for (const m of METHODS) {
    if (m.id === id) return m;
  }
  return null;
}

/**
 * 求解入口
 * @param {string} facelet 54 位状态
 * @param {string} method 'roux' | 'zz' | 'petrus' | 'blind'
 */
function solveAdvanced(facelet, method) {
  let res;
  if (method === 'roux') res = Roux.solveRoux(facelet);
  else if (method === 'zz') res = ZZ.solveZZ(facelet);
  else if (method === 'petrus') res = Petrus.solvePetrus(facelet);
  else if (method === 'blind') res = Blind.solveBlind(facelet);
  else {
    const e = new Error('未知解法：' + method);
    e.code = 'ADV_UNKNOWN';
    throw e;
  }
  const meta = methodMeta(method) || {};
  const simp = moveOpt.optimizeStages(facelet, res.moves, res.stages);
  const memoText = res.memo ? formatMemo(res.memo) : null;
  const explain = buildExplain(method, simp.stages, { total: simp.moves.length, memo: memoText });
  return {
    method,
    name: meta.name,
    emoji: meta.emoji,
    moves: simp.moves,
    stages: simp.stages,
    solved: !!res.solved,
    fallback: res.stages.some((s) => s.id === 'lbl-tail'),
    memo: memoText,
    explain: explain
  };
}

// 把编码整理成适合展示的字段
function formatMemo(memo) {
  const parts = (arr) => ({ text: arr.join(''), pairs: arr.length ? chunkPairs(arr) : '—' });
  const e = parts(memo.edge.letters || []);
  const c = parts(memo.corner.letters || []);
  return {
    edgeText: e.text || '已归位',
    edgePairs: e.pairs,
    cornerText: c.text || '已归位',
    cornerPairs: c.pairs,
    parity: !!memo.parity,
    twistedCount: (memo.edge.twisted || []).length + (memo.corner.twisted || []).length,
    summary: memo.summary || ''
  };
}
function chunkPairs(letters) {
  const out = [];
  for (let i = 0; i < letters.length; i += 2) out.push(letters.slice(i, i + 2).join(''));
  return out.join(' ');
}

/**
 * 一次算出多个方法（供 Worker 使用），单个失败不影响其它
 */
function solveMany(facelet, methods) {
  const out = {};
  (methods || METHODS.map((m) => m.id)).forEach((id) => {
    try {
      out[id] = solveAdvanced(facelet, id);
    } catch (e) {
      out[id] = { method: id, error: String((e && e.message) || e), code: (e && e.code) || 'ADV_FAIL' };
    }
  });
  return out;
}

export { solveAdvanced, solveMany, METHODS, methodMeta, formatMemo };
