/**
 * solveExplain.js —— 为"看解法"面板生成「本次解法说明」文字
 *
 * 每个解法都给两段文字（字号与面板其它文字一致）：
 *   idea  —— 这套解法的推理与做法（固定文案）
 *   steps —— 本次这一遍的各阶段步数与关键说明（由实际结果生成）
 *
 * 不依赖 wx / DOM，可在 Node / Worker 中通用。
 */

const IDEAS = {
  optimal:
    '思路：用两阶段搜索算法（Kociemba）在后台穷举求解，控制在 20 步出头；它不看"手法"是否顺手，只求步数最少，适合对照参考。',
  lbl:
    '思路：层先法一层一层来——底层十字 → 底层角块 → 中层棱块 → 顶层十字 → 顶面同色 → 顶层角归位 → 顶层棱归位。每一步只动刚学过的那一层，公式少、好记，是入门首选。',
  cfop:
    '思路：Cross 用「逐棱最短解」搭好底面十字；F2L 把角块和棱块配成对，一组组送进前两层；OLL 分两步翻好顶层颜色；PLL 用公式库识别情形，一条公式让顶层归位。',
  zbll:
    '思路：CFOP 的进阶版——前两层做法完全相同；顶层先把 4 条棱翻色（顶面十字），此时角翻色 + 角棱归位可以合成一条 ZBLL 公式一次完成，比"OLL + PLL 两条公式"更省。ZBLL 公式表覆盖 1942 种顶层情形。',
  roux:
    '思路：先在左右各搭一个 1×2×3 的「桥」（角块棱块一起拼，自由度高）；顶层四个角用公式一次归位（CMLL）；剩下六条棱只用 M/U 两种转动收尾（LSE），所以转动幅度小、特别适合单手。',
  zz:
    '思路：开局先把 12 条棱的朝向全部调正（EOLine），之后全程不用翻棱——前两层只用 R/U/L 三种转动就能完成，顶层也只需角翻色 + 归位两组公式。',
  petrus:
    '思路：先拼一个 2×2×3 的大方块（角块棱块一起搭），再把剩下棱块的朝向调正，之后只用 R/U/L 补完前两层，最后处理顶层。块构建自由度高、公式量小。',
  blind:
    '思路：不靠眼睛，靠编码——先把每个块「该去的位置」编成字母（本项目：角块缓冲 ULB = A、棱块缓冲 UB = A）；再按字母串把块一块块送回家，每个块用「setup + 纯三循环公式 + 还原 setup」；最后若剩两角两棱互换，用一条公式收尾。'
};

const GROUP_LABEL = {
  cross: '底层十字',
  corners: '底层角块',
  middle: '中层棱块',
  ucross: '顶层十字',
  uface: '顶面同色',
  'uperm-corners': '顶层角归位',
  'uperm-edges': '顶层棱归位',
  fb: 'FB 左桥',
  sb: 'SB 右桥',
  cmll: 'CMLL 顶层角',
  'lse-4a': 'LSE① 翻棱',
  'lse-4b': 'LSE② 归位 UL·UR',
  'lse-4c': 'LSE③ 收尾',
  eo: 'EOLine① 棱定向',
  line: 'EOLine② 归位底线',
  block223: '2×2×3 大块',
  dedge: 'DL·DR 两条底棱',
  'blind-edges': '棱块三循环',
  'blind-corners': '角块三循环',
  'blind-parity': '奇偶修正',
  zbll: 'ZBLL 一步顶层',
  'lbl-tail': '通用手法收尾'
};

function stageSum(stages, predicate) {
  let n = 0;
  stages.forEach((s) => {
    if (predicate(s.id)) n += (s.moves || []).length;
  });
  return n;
}
function has(stages, id) {
  return stages.some((s) => s.id === id);
}

/**
 * 生成说明文字
 * @param {string} method optimal | lbl | cfop | roux | zz | petrus | blind
 * @param {Array} stages 阶段数组（含 id/moves）
 * @param {Object} extra { total, pllName, backend, memo }
 */
function buildExplain(method, stages, extra) {
  extra = extra || {};
  const list = stages || [];
  const total = extra.total != null ? extra.total : stageSum(list, () => true);
  const parts = [];
  const push = (label, n) => {
    if (n > 0) parts.push(label + ' ' + n + ' 步');
  };
  const notes = [];
  const tail = has(list, 'lbl-tail');

  if (method === 'optimal') {
    parts.push('共 ' + total + ' 步');
    if (extra.backend) notes.push('算法：' + extra.backend);
    return { idea: IDEAS.optimal, steps: '本次：' + parts.join('，') + (notes.length ? '（' + notes.join('；') + '）' : '') + '。' };
  }

  if (method === 'lbl') {
    ['cross', 'corners', 'middle', 'ucross', 'uface', 'uperm-corners', 'uperm-edges'].forEach((id) => {
      push(GROUP_LABEL[id], stageSum(list, (x) => x === id));
    });
  } else if (method === 'cfop') {
    push('Cross', stageSum(list, (x) => x === 'cross'));
    push('F2L 4 组', stageSum(list, (x) => x.indexOf('f2l') === 0));
    push('OLL', stageSum(list, (x) => x === 'ucross' || x === 'uface'));
    const pll = stageSum(list, (x) => x === 'pll-one' || x.indexOf('uperm') >= 0);
    push('PLL', pll);
    if (extra.pllName) notes.push('PLL 识别为「' + extra.pllName + '」，一条公式搞定');
    notes.push('Cross 逐棱用 BFS 求最短解');
  } else if (method === 'roux') {
    push('FB 左桥', stageSum(list, (x) => x === 'fb'));
    push('SB 右桥', stageSum(list, (x) => x === 'sb'));
    push('CMLL', stageSum(list, (x) => x === 'cmll'));
    push('LSE 六棱', stageSum(list, (x) => x.indexOf('lse') === 0));
    notes.push('LSE 用投影键 BFS，是该阶段的最短解');
  } else if (method === 'zbll') {
    push('Cross', stageSum(list, (x) => x === 'cross'));
    push('F2L 4 组', stageSum(list, (x) => x.indexOf('f2l') === 0));
    push('顶层十字', stageSum(list, (x) => x === 'ucross'));
    push('ZBLL 一步顶层', stageSum(list, (x) => x === 'zbll'));
    if (has(list, 'zbll')) notes.push('ZBLL 由公式表识别情形，一条公式完成顶层');
    notes.push('Cross 逐棱用 BFS 求最短解');
  } else if (method === 'zz') {
    push('EOLine', stageSum(list, (x) => x === 'eo' || x === 'line'));
    push('F2L', stageSum(list, (x) => x.indexOf('f2l') === 0));
    push('OCLL', stageSum(list, (x) => x.indexOf('ocll') === 0));
    push('PLL', stageSum(list, (x) => x.indexOf('zz-pll') === 0));
    if (has(list, 'zz-pll-one')) notes.push('PLL 用公式库一步识别');
    notes.push('EO 用朝向掩码 BFS，保证最短；F2L 全程只用 R/U/L');
    if (has(list, 'zbll')) notes.push('顶层用 ZBLL 一步完成（ZZ-a）');
  } else if (method === 'petrus') {
    push('2×2×3 块', stageSum(list, (x) => x === 'block223'));
    push('棱定向', stageSum(list, (x) => x === 'eo'));
    push('完成前两层', stageSum(list, (x) => x === 'dedge' || x.indexOf('f2l') === 0));
    push('OLL', stageSum(list, (x) => x.indexOf('petrus-oll') === 0));
    push('PLL', stageSum(list, (x) => x.indexOf('petrus-pll') === 0));
  } else if (method === 'blind') {
    push('棱三循环', stageSum(list, (x) => x === 'blind-edges'));
    push('角三循环', stageSum(list, (x) => x === 'blind-corners'));
    push('奇偶/收尾', stageSum(list, (x) => x === 'blind-parity'));
    const mem = extra.memo;
    if (mem) {
      notes.push(
        '本次编码：棱 ' + (mem.edgeText ? mem.edgeText.length : 0) + ' 个字母、角 ' +
        (mem.cornerText ? mem.cornerText.length : 0) + ' 个字母' +
        (mem.parity ? '，存在奇偶（两角两棱互换）' : '，无奇偶') +
          (mem.twistedCount ? '；另有 ' + mem.twistedCount + ' 块原位扭转/翻转，由收尾阶段处理' : '')
      );
    }
  }
  parts.push('共 ' + total + ' 步');
  if (tail) notes.push('本方法特定阶段这次没搜到解，尾部改用通用手法补齐（阶段列表里已标注）');
  const steps = '本次：' + parts.join(' → ') + (notes.length ? '。' + notes.join('；') + '。' : '。');
  return { idea: IDEAS[method] || '', steps };
}

export { buildExplain, IDEAS, GROUP_LABEL };
