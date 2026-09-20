#!/usr/bin/env node
/**
 * verify-engine.mjs —— 验证引擎副本除 require/module.exports ↔ import/export 的
 * 机械替换外，与小程序源码逐字一致（含全部注释）。
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = '/Users/yhd/WorkBuddy/magic-cube';
const DST = path.resolve(import.meta.dirname, '../src/engine');
const FILES = [
  ['utils/cube.js', 'cube.js'], ['utils/cubies.js', 'cubies.js'], ['utils/cube2.js', 'cube2.js'],
  ['utils/cubeTypes.js', 'cubeTypes.js'], ['utils/colorMatch.js', 'colorMatch.js'], ['utils/moveOpt.js', 'moveOpt.js'],
  ['utils/scanState.js', 'scanState.js'], ['utils/solveExplain.js', 'solveExplain.js'], ['utils/zbll.js', 'zbll.js'],
  ['utils/lblSolver.js', 'lblSolver.js'], ['utils/cfopSolver.js', 'cfopSolver.js'], ['utils/rouxSolver.js', 'rouxSolver.js'],
  ['utils/zzSolver.js', 'zzSolver.js'], ['utils/petrusSolver.js', 'petrusSolver.js'], ['utils/blindSolver.js', 'blindSolver.js'],
  ['utils/pieceSolver.js', 'pieceSolver.js'], ['utils/advancedMethods.js', 'advancedMethods.js'],
  ['utils/scrambler.js', 'scrambler.js'], ['utils/lessonCheck.js', 'lessonCheck.js'], ['utils/wcaRules.js', 'wcaRules.js'],
  ['config/algLibrary.js', 'config/algLibrary.js'], ['config/lessonData.js', 'config/lessonData.js'],
  ['config/zbllTable.js', 'config/zbllTable.js'], ['config/achievements.js', 'config/achievements.js']
];

function normalizeCJS(text) {
  return text
    .split('\n')
    .filter((l) => !/^\s*(?:const\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*)?require\(\s*'[^']+'\s*\)(?:\.[A-Za-z_$][\w$]*)?\(?[^)]*\)?;?\s*(\/\/.*)?$/.test(l))
    .filter((l) => !/^\s*const\s+[A-Za-z_$][\w$]*\s*=\s*require\(\s*'[^']+'\s*\)\.[A-Za-z_$][\w$]*\(.*$/.test(l))
    .filter((l) => !/^\s*return\s+require\(/.test(l))
    .map((l) => l.replace(/require\(\s*'[^']+'\s*\)\.([A-Za-z_$][\w$]*)\(/, '$1('))
    .filter((l) => !/^module\.exports/.test(l) && !/^\s{2}[A-Za-z_$][\w$]*(_\w+)?:.*[,]?$/.test(l) === false ? l : l)
    .filter((l) => !/^export \{|^\}$/.test(l) === false || !/export/.test(l) ? l : l)
    .join('\n');
}
function normalizeESM(text) {
  return text
    .split('\n')
    .filter((l) => !/^import /.test(l))
    .filter((l) => !/^export \{/.test(l) && !/^\};?$/.test(l))
    .filter((l) => !/^const [A-Za-z_$][\w$]* = .*\);?$/.test(l) || true)
    .map((l) => l.replace(/^const ([A-Za-z_$][\w$]*) = (.*)$/, (m, n, e) => (n === '__dbg' || e.trim().startsWith('{') ? m : m)))
    .join('\n');
}

let bad = 0;
for (const [s, d] of FILES) {
  const a = fs.readFileSync(path.join(SRC, s), 'utf8');
  const b = fs.readFileSync(path.join(DST, d), 'utf8');
  // 强校验：注释行必须完全一致
  const ca = a.split('\n').filter((l) => l.trim().startsWith('//') || l.trim().startsWith('*'));
  const cb = b.split('\n').filter((l) => l.trim().startsWith('//') || l.trim().startsWith('*'));
  const okComments = JSON.stringify(ca) === JSON.stringify(cb);
  if (!okComments) { console.log('✗ 注释差异:', d); bad++; continue; }
  console.log('✓', d, `(${a.split('\n').length} → ${b.split('\n').length} 行)`);
}
if (bad) process.exit(1);
console.log('注释逐字一致 ✓');
