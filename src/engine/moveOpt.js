/**
 * moveOpt.js —— 转动序列化简（去重复/合并/交换消解）
 *
 * 各求解器把多个阶段的搜索结果拼接在一起，阶段边界处常出现
 * 「同面相邻」（R R'、U U2）或「同轴可交换」的冗余（R L R' = L）。
 * 本模块在不改变物理效果的前提下消解这些冗余，并同步修正阶段归属，
 * 供"看解法"面板按阶段展示。
 *
 * 不依赖 wx / DOM，可在 Node 中通用。
 */


import { Cube } from './cube.js';
const FACE_AXIS = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z', M: 'x', E: 'y', S: 'z' };

function amountOf(m) {
  return m.length === 1 ? 1 : m[1] === '2' ? 2 : 3;
}
function moveOf(face, amount) {
  return face + (amount === 1 ? '' : amount === 2 ? '2' : "'");
}

/**
 * 化简一条转动序列（纯局部代数：同面合并 + 同轴交换后合并）
 * @param {string[]} moves
 * @returns {string[]}
 */
function simplifySequence(moves) {
  const items = moves.map((m) => ({ f: m[0], a: amountOf(m), s: 0 }));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10000) {
    changed = false;
    for (let i = 0; i + 1 < items.length; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (a.f === b.f) {
        // 同面相邻：合并（R R → R2，R R' → 消失）
        const sum = (a.a + b.a) % 4;
        const merged = sum === 0 ? [] : [{ f: a.f, a: sum, s: a.s }];
        items.splice(i, 2, ...merged);
        changed = true;
        break;
      }
      if (FACE_AXIS[a.f] === FACE_AXIS[b.f] && i + 2 < items.length) {
        const c = items[i + 2];
        if (c.f === a.f) {
          // 同轴异面可交换：把 b 后移，让 a、c 相邻后合并（R L R' → L）
          items.splice(i + 1, 2, c, b);
          changed = true;
          break;
        }
      }
    }
  }
  return items.map((x) => moveOf(x.f, x.a));
}

/**
 * 化简整条序列并同步修正阶段划分
 * @param {string[]} moves 完整序列
 * @param {Array<{from:number, moves:string[]}>} stages 阶段（含 from 与 moves）
 * @returns {{ moves: string[], stages: Array }}
 */
function simplifyStages(moves, stages) {
  if (!stages || !stages.length) {
    return { moves: simplifySequence(moves), stages };
  }
  // 给每个转动打上阶段号
  const tagged = [];
  stages.forEach((st, si) => {
    (st.moves || []).forEach((m) => tagged.push({ f: m[0], a: amountOf(m), s: si }));
  });
  // 与 simplifySequence 相同的化简循环（合并后的转动归属前一个阶段）
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10000) {
    changed = false;
    for (let i = 0; i + 1 < tagged.length; i++) {
      const a = tagged[i];
      const b = tagged[i + 1];
      if (a.f === b.f) {
        const sum = (a.a + b.a) % 4;
        const merged = sum === 0 ? [] : [{ f: a.f, a: sum, s: a.s }];
        tagged.splice(i, 2, ...merged);
        changed = true;
        break;
      }
      if (FACE_AXIS[a.f] === FACE_AXIS[b.f] && i + 2 < tagged.length) {
        const c = tagged[i + 2];
        if (c.f === a.f) {
          tagged.splice(i + 1, 2, c, b);
          changed = true;
          break;
        }
      }
    }
  }
  // 重建阶段与 from
  const newMoves = [];
  const newStages = stages.map((st) => Object.assign({}, st, { moves: [], from: 0 }));
  tagged.forEach((it) => {
    newStages[it.s].moves.push(moveOf(it.f, it.a));
    newMoves.push(moveOf(it.f, it.a));
  });
  let cursor = 0;
  newStages.forEach((st) => {
    st.from = cursor;
    cursor += st.moves.length;
  });
  return { moves: newMoves, stages: newStages };
}

// ---- 状态保持的删步优化 ----
/**
 * 按 from 标记重建每个阶段的 moves（保证各阶段拼接恰好等于整条序列）。
 * 某些求解器在阶段中途失败时会漏收尾，这里统一兜住。
 */
function syncStageMoves(moves, stages) {
  if (!stages || !stages.length) return stages;
  const ordered = stages.slice().sort((a, b) => (a.from || 0) - (b.from || 0));
  // 优先信任各阶段自己记录的 moves：拼接一致时按累计长度重算 from
  // （某些求解器算 from 偏移易出错，记录本身才是准确的）
  const recorded = ordered.reduce((a, s) => a.concat(s.moves || []), []);
  if (recorded.length === moves.length && recorded.join(' ') === moves.join(' ')) {
    let cursor = 0;
    ordered.forEach((st) => {
      st.moves = (st.moves || []).slice();
      st.from = cursor;
      cursor += st.moves.length;
    });
    return stages;
  }
  // 记录不完整（阶段中途失败等）→ 按 from 标记重建
  ordered.forEach((st, i) => {
    const start = st.from || 0;
    const end = i + 1 < ordered.length ? (ordered[i + 1].from || 0) : moves.length;
    st.moves = moves.slice(start, Math.max(start, end));
  });
  return stages;
}

function toTagged(moves, stages) {
  const tagged = [];
  stages.forEach((st, si) => {
    (st.moves || []).forEach((m) => tagged.push({ f: m[0], a: amountOf(m), s: si }));
  });
  return tagged;
}
function fromTagged(tagged, stages) {
  const newMoves = tagged.map((it) => moveOf(it.f, it.a));
  const stageCount = stages.length;
  const buckets = [];
  for (let i = 0; i < stageCount; i++) buckets.push([]);
  tagged.forEach((it) => {
    if (buckets[it.s]) buckets[it.s].push(moveOf(it.f, it.a));
  });
  let cursor = 0;
  const newStages = stages.map((st, i) => {
    const copy = Object.assign({}, st, { moves: buckets[i], from: cursor });
    cursor += buckets[i].length;
    return copy;
  });
  return { moves: newMoves, stages: newStages };
}
function simplifyTagged(tagged) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 10000) {
    changed = false;
    for (let i = 0; i + 1 < tagged.length; i++) {
      const a = tagged[i];
      const b = tagged[i + 1];
      if (a.f === b.f) {
        const sum = (a.a + b.a) % 4;
        const merged = sum === 0 ? [] : [{ f: a.f, a: sum, s: a.s }];
        tagged.splice(i, 2, ...merged);
        changed = true;
        break;
      }
      if (FACE_AXIS[a.f] === FACE_AXIS[b.f] && i + 2 < tagged.length) {
        const c = tagged[i + 2];
        if (c.f === a.f) {
          tagged.splice(i + 1, 2, c, b);
          changed = true;
          break;
        }
      }
    }
  }
  return tagged;
}
function endFaceletOf(startFacelet, moves) {
  const c = new Cube(startFacelet);
  for (let i = 0; i < moves.length; i++) c.move(moves[i]);
  return c.getFacelet();
}

/**
 * 完整优化：化简（同面/同轴）+ 删步（保持整条序列的最终状态不变）
 * 删步能去掉化简抓不到的"跨阶段真冗余"（如两组手法之间互相抵消的部分）。
 * @param {string} startFacelet 序列执行前的状态
 * @param {string[]} moves
 * @param {Array} stages
 */
function optimizeStages(startFacelet, moves, stages) {
  if (stages && stages.length) syncStageMoves(moves, stages);
  if (!stages || !stages.length) {
    let seq = simplifySequence(moves);
    const end = endFaceletOf(startFacelet, seq);
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (let len = 2; len >= 1 && !changed; len--) {
        for (let i = 0; i + len <= seq.length; i++) {
          const trial = seq.slice(0, i).concat(seq.slice(i + len));
          if (endFaceletOf(startFacelet, trial) === end) {
            seq = trial;
            changed = true;
            break;
          }
        }
      }
    }
    return { moves: seq, stages };
  }
  const tagged = simplifyTagged(toTagged(moves, stages));
  const end = endFaceletOf(startFacelet, tagged.map((it) => moveOf(it.f, it.a)));
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 6) {
    changed = false;
    for (let len = 2; len >= 1 && !changed; len--) {
      for (let i = 0; i + len <= tagged.length; i++) {
        const trial = tagged.slice(0, i).concat(tagged.slice(i + len));
        if (endFaceletOf(startFacelet, trial.map((it) => moveOf(it.f, it.a))) === end) {
          tagged.length = 0;
          trial.forEach((x) => tagged.push(x));
          changed = true;
          break;
        }
      }
    }
  }
  return fromTagged(tagged, stages);
}

export { simplifySequence, simplifyStages, optimizeStages, syncStageMoves, FACE_AXIS };
