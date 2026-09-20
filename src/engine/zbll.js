/**
 * zbll.js —— ZBLL（顶层一步式）运行时匹配
 *
 * 适用条件：前两层已完成 + 顶层棱块朝向已好（U 面十字已成）。
 * 此时顶层只剩「角翻色 + 角棱换位」的组合，ZBLL 用一个公式全部解决。
 *
 * 公式表由 scripts/gen-zbll.js 生成：以已验证的顶层公式为生成元，
 * 在"保持前两层"的顶层状态空间上做 BFS，得到每个情形的最短公式组合，
 * 生成时逐条验证过"对该情形应用公式后复原"。
 *
 * 不依赖 wx / DOM，可在 Node / Worker 中通用。
 */



import { ZBLL_TABLE } from './config/zbllTable.js';
import { Cube, SOLVED } from './cube.js';
import { CORNERS, EDGES, pieceArrays } from './cubies.js';
const TABLE = new Map();
ZBLL_TABLE.forEach((e) => {
  TABLE.set(e[0], e[1]);
});

/** 前两层是否完成（角块/棱块全部归位且朝向正确，不含顶层） */
function f2lDone(st) {
  const pa = pieceArrays(st);
  if (!pa || !pa.cp) return false;
  for (let i = 0; i < 8; i++) {
    if (CORNERS[i].pos[1] !== 1 && !(pa.cp[i] === i && pa.co[i] === 0)) return false;
  }
  for (let i = 0; i < 12; i++) {
    if (EDGES[i].pos[1] !== 1 && !(pa.ep[i] === i && pa.eo[i] === 0)) return false;
  }
  return true;
}

/** 顶层 4 条棱朝向是否已好（U 面十字） */
function uEdgesOriented(st) {
  const pa = pieceArrays(st);
  if (!pa || !pa.eo) return false;
  for (let i = 0; i < 12; i++) {
    if (EDGES[i].pos[1] !== 1) continue;
    if (pa.eo[i] !== 0) return false;
  }
  return true;
}

/** 情形键（按 AUF 归一：取 4 个顶层旋转里字典序最小者） */
function caseKeyOf(st) {
  let best = null;
  for (let k = 0; k < 4; k++) {
    const c = new Cube(st);
    for (let t = 0; t < k; t++) c.move('U');
    const s2 = c.getFacelet();
    const pa = pieceArrays(s2);
    let key = '';
    for (let i = 0; i < 8; i++) key += String.fromCharCode(65 + pa.cp[i]) + pa.co[i];
    for (let i = 0; i < 12; i++) key += EDGES[i].pos[1] === 1 ? String.fromCharCode(65 + pa.ep[i]) + pa.eo[i] : '';
    if (best === null || key < best) best = key;
  }
  return best;
}

/** 情形名称：几个角待翻 / 几个角待换位 / 几条棱待换位 */
function caseNameOf(st) {
  const pa = pieceArrays(st);
  let badCorners = 0;
  let cornerPerm = 0;
  let badEdges = 0;
  for (let i = 0; i < 8; i++) {
    if (CORNERS[i].pos[1] !== 1) continue;
    if (pa.co[i] !== 0) badCorners++;
    if (pa.cp[i] !== i) cornerPerm++;
  }
  for (let i = 0; i < 12; i++) {
    if (EDGES[i].pos[1] !== 1) continue;
    if (pa.ep[i] !== i) badEdges++;
  }
  const parts = [];
  parts.push(badCorners === 0 ? '顶面已翻好' : badCorners + ' 个角待翻');
  parts.push(cornerPerm === 0 ? '角已归位' : cornerPerm + ' 个角待换位');
  parts.push(badEdges === 0 ? '棱已归位' : badEdges + ' 条棱待换位');
  return parts.join(' · ');
}

/**
 * 匹配 ZBLL
 * @param {string} facelet
 * @returns { applicable, found, key, name, moves }
 */
function matchZbll(facelet) {
  const st = facelet;
  if (st === SOLVED) return { applicable: false, found: false };
  if (!f2lDone(st) || !uEdgesOriented(st)) {
    return { applicable: false, found: false, reason: '需要前两层完成且顶层十字已成' };
  }
  const key = caseKeyOf(st);
  const algStr = TABLE.get(key);
  if (!algStr) return { applicable: true, found: false, key };
  const alg = algStr.split(' ').filter(Boolean);
  // 情形键按 AUF 归一，而公式只对其中一个 AUF 代表成立：
  // 依次用 4 个 AUF 前缀试（末尾再允许补一个 AUF 对齐），返回能真正复原的那条
  const AUFS = [[], ['U'], ['U2'], ["U'"]];
  for (let i = 0; i < AUFS.length; i++) {
    const pre = AUFS[i];
    const c = new Cube(st);
    pre.forEach((m) => c.move(m));
    alg.forEach((m) => c.move(m));
    for (let j = 0; j < AUFS.length; j++) {
      const tail = AUFS[j];
      const c2 = new Cube(c.getFacelet());
      tail.forEach((m) => c2.move(m));
      if (c2.getFacelet() === SOLVED) {
        return {
          applicable: true,
          found: true,
          key,
          name: caseNameOf(st),
          moves: pre.concat(alg, tail)
        };
      }
    }
  }
  return { applicable: true, found: false, key };
}

// ---- 教学分类：按「顶层角块朝向形态」把 1942 种情形分成 5 个家族 ----
// 顶层 4 个角槽：2=左后(ULB) 3=左前(UFL) 7=右前(URF) 6=右后(UBR)
// 相邻关系（绕顶面一圈）：2-3-7-6-2；对角：2-7、3-6
var U_CORNER_SLOTS = [2, 3, 7, 6];
var U_SLOT_NAME = { 2: '左后', 3: '左前', 7: '右前', 6: '右后' };
var U_ADJACENT = [[2, 3], [3, 7], [7, 6], [6, 2]];

function classifyKey(key) {
  var twisted = [];
  for (var i = 0; i < U_CORNER_SLOTS.length; i++) {
    var slot = U_CORNER_SLOTS[i];
    var co = parseInt(key[slot * 2 + 1], 10);
    if (co !== 0) twisted.push({ slot: slot, co: co });
  }
  var dirName = function (co) { return co === 1 ? '顺' : '逆'; };
  if (twisted.length === 0) {
    return { id: 'ori', desc: '四角均朝上' };
  }
  if (twisted.length === 4) {
    var pat = twisted.map(function (t) { return t.co; }).join('');
    return { id: 'hp', desc: '四角待翻（扭转 ' + pat + '）' };
  }
  if (twisted.length === 3) {
    // 三角同向扭转才可能（扭转和 ≡ 0）
    var d3 = twisted[0].co === 1 ? 'Sune 方向' : '反小鱼 方向';
    return { id: 'sune', desc: twisted.map(function (t) { return U_SLOT_NAME[t.slot] + '（' + dirName(t.co) + '）'; }).join('·') + '，' + d3 };
  }
  // 两个待翻：必为一顺一逆；按相邻/对角分 T-U 型与 L 型
  var a = twisted[0];
  var b = twisted[1];
  var adjacent = U_ADJACENT.some(function (p) {
    return (p[0] === a.slot && p[1] === b.slot) || (p[0] === b.slot && p[1] === a.slot);
  });
  var desc2 = a.slot < b.slot
    ? U_SLOT_NAME[a.slot] + '（' + dirName(a.co) + '）· ' + U_SLOT_NAME[b.slot] + '（' + dirName(b.co) + '）'
    : U_SLOT_NAME[b.slot] + '（' + dirName(b.co) + '）· ' + U_SLOT_NAME[a.slot] + '（' + dirName(a.co) + '）';
  return { id: adjacent ? 'tu' : 'l', desc: desc2 };
}

/** 把公式表按 5 个家族分组（供学习页浏览） */
function buildFamilies() {
  var families = [
    { id: 'ori', title: '入门：角块已全部朝上', sub: '只差换位（包含全部 PLL 情形），最适合先学', cases: [] },
    { id: 'sune', title: '一个角朝上', sub: 'Sune / 反小鱼 型', cases: [] },
    { id: 'tu', title: '两个相邻角待翻', sub: 'T / U 型', cases: [] },
    { id: 'l', title: '两个对角待翻', sub: 'L 型', cases: [] },
    { id: 'hp', title: '四个角待翻', sub: 'H / Pi 型', cases: [] }
  ];
  var byId = {};
  families.forEach(function (f) { byId[f.id] = f; });
  ZBLL_TABLE.forEach(function (entry) {
    var key = entry[0];
    var alg = entry[1];
    var cls = classifyKey(key);
    if (!cls) return;
    var pa = null;
    var permDesc = '';
    try {
      pa = pieceArrays((new Cube(stFromKey(key))).getFacelet());
    } catch (e) { pa = null; }
    if (pa) {
      var nc = 0, ne = 0;
      for (var i = 0; i < 8; i++) if (CORNERS[i].pos[1] === 1 && pa.cp[i] !== i) nc++;
      for (var j = 0; j < 12; j++) if (EDGES[j].pos[1] === 1 && pa.ep[j] !== j) ne++;
      permDesc = nc + ' 角 ' + ne + ' 棱待换位';
    }
    byId[cls.id].cases.push({ key: key, alg: alg, desc: cls.desc, perm: permDesc });
  });
  families.forEach(function (f) {
    f.count = f.cases.length;
    delete f.cases; // 页面按需再取，避免一次性渲染上千条
  });
  return families;
}

// 由情形键重建该情形的状态（还原 = 逆公式前的状态；这里用逆推：把公式逆过来作用在复原态）
function stFromKey(key) {
  var alg = null;
  for (var i = 0; i < ZBLL_TABLE.length; i++) if (ZBLL_TABLE[i][0] === key) { alg = ZBLL_TABLE[i][1]; break; }
  var c = new Cube(SOLVED);
  if (alg) {
    var moves = alg.split(' ');
    for (var k = moves.length - 1; k >= 0; k--) {
      var m = moves[k];
      c.move(m.length === 1 ? m + "'" : m[1] === '2' ? m : m[0]);
    }
  }
  return c.getFacelet();
}

const TABLE_SIZE = TABLE.size;

export { matchZbll, caseKeyOf, caseNameOf, f2lDone, uEdgesOriented, classifyKey, buildFamilies, TABLE_SIZE };
