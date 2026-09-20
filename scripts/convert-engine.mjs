#!/usr/bin/env node
/**
 * convert-engine.mjs —— 把小程序引擎（CommonJS）机械式转换为 ES Module。
 *
 * 只做语法层面的机械转换，不改任何逻辑：
 *   1. `const { A, B } = require('./x.js')`          → `import { A, B } from './x.js'`
 *   2. `const x = require('./x.js')`（整包）          → `import * as x from './x.js'`
 *   3. 函数内的惰性 require 一律提升为顶部 import（运行时才访问绑定，ESM 循环依赖安全）
 *   4. `module.exports = { A, B, K: expr }`          → `export { A, B }` + `const K = expr; export { K }`
 *   5. config/index.js 的对象字面量导出 → 逐键 `export const KEY = ...`
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = '/Users/yhd/WorkBuddy/magic-cube';
const DST = path.resolve(import.meta.dirname, '../src/engine');

const FILES = [
  ['utils/cube.js', 'cube.js'],
  ['utils/cubies.js', 'cubies.js'],
  ['utils/cube2.js', 'cube2.js'],
  ['utils/cubeTypes.js', 'cubeTypes.js'],
  ['utils/colorMatch.js', 'colorMatch.js'],
  ['utils/moveOpt.js', 'moveOpt.js'],
  ['utils/scanState.js', 'scanState.js'],
  ['utils/solveExplain.js', 'solveExplain.js'],
  ['utils/zbll.js', 'zbll.js'],
  ['utils/lblSolver.js', 'lblSolver.js'],
  ['utils/cfopSolver.js', 'cfopSolver.js'],
  ['utils/rouxSolver.js', 'rouxSolver.js'],
  ['utils/zzSolver.js', 'zzSolver.js'],
  ['utils/petrusSolver.js', 'petrusSolver.js'],
  ['utils/blindSolver.js', 'blindSolver.js'],
  ['utils/pieceSolver.js', 'pieceSolver.js'],
  ['utils/advancedMethods.js', 'advancedMethods.js'],
  ['utils/scrambler.js', 'scrambler.js'],
  ['utils/lessonCheck.js', 'lessonCheck.js'],
  ['utils/wcaRules.js', 'wcaRules.js'],
  // config/index.js 的对象字面量导出含行内注释，手工转换（见 src/engine/config/index.js）
  ['config/algLibrary.js', 'config/algLibrary.js'],
  ['config/lessonData.js', 'config/lessonData.js'],
  ['config/zbllTable.js', 'config/zbllTable.js'],
  ['config/achievements.js', 'config/achievements.js']
];

function resolvePath(rel, fromDirLabel) {
  // rel 形如 './cube.js' 或 '../config/index.js'，目标一律在 engine 根下
  const base = fromDirLabel === 'config' ? 'config' : '';
  const cleaned = rel.replace(/^\.\//, '').replace(/^\.\.\//, '');
  return base && !cleaned.startsWith('config/') ? `${base}/${cleaned}` : cleaned;
}

let report = [];

for (const [srcRel, dstRel] of FILES) {
  const src = path.join(SRC, srcRel);
  const dst = path.join(DST, dstRel);
  let text = fs.readFileSync(src, 'utf8');
  const fromDir = dstRel.includes('/') ? 'config' : 'utils';

  // 收集 require： { raw, path, names|null|namespace-binding, line, lazy }
  const requires = [];
  const re = /(?:const\s+(?:\{([^}]*)\}\s*=|[A-Za-z_$][\w$]*\s*=))?\s*require\(\s*'([^']+)'\s*\)(?:\.([A-Za-z_$][\w$]*))?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    requires.push({
      raw: m[0],
      destructure: m[1] ? m[1].split(',').map((s) => s.trim()).filter(Boolean).map((n) => {
        // 对象解构重命名 `A: B` → import 重命名 `A as B`
        const rm = n.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
        return rm ? `${rm[1]} as ${rm[2]}` : n;
      }) : null,
      target: m[2],
      prop: m[3] || null,
      index: m.index
    });
  }

  // 逐个替换：惰性 require（非行首 const 声明，即缩进的）删除整行并提升；
  // 顶层 require 替换为空（import 统一生成在头部）。
  const hoisted = new Map(); // importPath -> { namespace: name|null, names: Set }
  function addImport(target, namespace, names, prop) {
    const importPath = './' + resolvePath(target, fromDir);
    let entry = hoisted.get(importPath);
    if (!entry) { entry = { namespace: null, names: new Set() }; hoisted.set(importPath, entry); }
    if (namespace) {
      if (entry.namespace && entry.namespace !== namespace) {
        throw new Error(`${dstRel}: 命名空间绑定冲突 ${entry.namespace} / ${namespace}`);
      }
      entry.namespace = namespace;
    }
    if (prop && !namespace) {
      entry.names.add(prop);
      return prop; // require('./x.js').Prop → 使用 Prop 绑定
    }
    (names || []).forEach((n) => entry.names.add(n));
    return null;
  }

  // 先按行处理，方便删除惰性行
  const lines = text.split('\n');
  const dropLines = new Set();
  const lineEdits = new Map(); // lineIdx -> replacement text

  lines.forEach((line, i) => {
    if (!line.includes('require(')) return;
    const trimmed = line.trim();
    const isIndented = /^\s/.test(line);

    // 形如 `const X = require('./y.js');`（整包）
    let mm = trimmed.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*'([^']+)'\s*\);?$/);
    if (mm) {
      const name = addImport(mm[2], mm[1], null, null);
      dropLines.add(i);
      return;
    }
    // 形如 `const { A, B } = require('./y.js');`
    mm = trimmed.match(/^const\s+\{([^}]*)\}\s*=\s*require\(\s*'([^']+)'\s*\);?$/);
    if (mm) {
      const names = mm[1].split(',').map((s) => s.trim()).filter(Boolean).map((n) => {
        const rm = n.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/);
        return rm ? `${rm[1]} as ${rm[2]}` : n;
      });
      addImport(mm[2], null, names, null);
      dropLines.add(i);
      return;
    }
    // 形如 `const X = require('./y.js').Prop;`
    mm = trimmed.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*'([^']+)'\s*\)\.([A-Za-z_$][\w$]*);?$/);
    if (mm) {
      const bind = addImport(mm[2], null, null, mm[3]);
      if (bind !== mm[1]) throw new Error(`${dstRel}: 内联属性 require 别名不支持 ${line}`);
      dropLines.add(i);
      return;
    }
    // 形如 `const X = require('./y.js').Prop(...);` —— 提升导入后保留调用：`const X = Prop(...);`
    mm = trimmed.match(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*'([^']+)'\s*\)\.([A-Za-z_$][\w$]*)\((.+)\);?(.*)$/);
    if (mm) {
      addImport(mm[2], null, null, mm[3]);
      const indent = line.match(/^\s*/)[0];
      const comment = mm[5] ? ' ' + mm[5].trim() : '';
      lineEdits.set(i, `${indent}const ${mm[1]} = ${mm[3]}(${mm[4]});${comment}`);
      return;
    }
    // 形如 `return require('./y.js').pieceArrays(...)` —— 用已导入的绑定替换表达式
    mm = trimmed.match(/^return\s+require\(\s*'([^']+)'\s*\)\.([A-Za-z_$][\w$]*)\((.*)\);?$/);
    if (mm) {
      const bind = addImport(mm[1], null, null, mm[2]);
      lineEdits.set(i, line.replace(/require\(\s*'[^']+'\s*\)\.[A-Za-z_$][\w$]*\(/, bind + '('));
      return;
    }
    throw new Error(`${dstRel}: 未识别的 require 模式 → ${JSON.stringify(trimmed)}`);
  });

  // 应用行编辑（从后往前）
  const outLines = [];
  lines.forEach((line, i) => {
    if (dropLines.has(i)) return;
    outLines.push(lineEdits.has(i) ? lineEdits.get(i) : line);
  });
  text = outLines.join('\n');

  // 生成 import 头：插在文件头注释块之后
  const imports = [];
  const paths = Array.from(hoisted.keys()).sort();
  for (const p of paths) {
    const e = hoisted.get(p);
    if (e.namespace) imports.push(`import * as ${e.namespace} from '${p}';`);
    if (e.names.size) {
      const names = Array.from(e.names).sort().join(', ');
      imports.push(`import { ${names} } from '${p}';`);
    }
  }
  if (imports.length) {
    // 找到头部块注释结束的位置（连续的以 ' *' 开头的注释之后）
    const lines2 = text.split('\n');
    let insertAt = 0;
    if (lines2[0] && lines2[0].trim().startsWith('/*')) {
      let j = 0;
      while (j < lines2.length && !lines2[j].includes('*/')) j++;
      insertAt = j + 1;
    }
    while (insertAt < lines2.length && lines2[insertAt].trim() === '') insertAt++;
    lines2.splice(insertAt, 0, '', ...imports);
    text = lines2.join('\n');
  }

  // module.exports 转换
  const expIdx = text.indexOf('module.exports');
  if (expIdx >= 0) {
    const before = text.slice(0, expIdx);
    const seg = text.slice(expIdx);
    const mmEnd = seg.match(/^module\.exports\s*=\s*\{([\s\S]*)\}\s*;?\s*$/);
    if (!mmEnd) throw new Error(`${dstRel}: 未识别的 module.exports`);
    const body = mmEnd[1];
    // 顶层条目切分（深度 0 的逗号）
    const entries = [];
    let depth = 0, cur = '', inStr = null;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (inStr) {
        cur += ch;
        if (ch === inStr && body[i - 1] !== '\\') inStr = null;
        continue;
      }
      if (ch === '\'' || ch === '"' || ch === '`') { inStr = ch; cur += ch; continue; }
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      if (ch === '}' || ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { entries.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) entries.push(cur);

    const plain = [];
    const computed = [];
    for (const e of entries) {
      const t = e.trim();
      if (!t) continue;
      const km = t.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
      if (km && km[1] !== 'default') computed.push(km);
      else plain.push(t);
    }

    const tail = [];
    for (const [, name, expr] of computed) tail.push(`const ${name} = ${expr.trim()};`);
    if (computed.length) tail.push('');
    tail.push(`export { ${[...plain, ...computed.map(([, n]) => n)].join(', ')} };`);
    text = before + tail.join('\n') + '\n';
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, text);
  report.push(`${dstRel}: imports=${imports.length}, computedExports=${report.length}`);
}

console.log(report.join('\n'));
console.log('done');
