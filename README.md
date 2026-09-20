# 魔力魔方 Web 版（magic-cube-web）

面向 5-12 岁儿童的魔方学习应用「魔力魔方」微信小程序的 **Vue 3 全栈 Web 复刻版（PWA）**。
手机优先、触屏适配，可安装到主屏幕、离线可用，全部数据保存在本机（IndexedDB）。

## 运行

```bash
npm install
npm run dev        # 开发（http://localhost:5173）
npm run test       # Vitest 全部测试
npm run build      # 产物输出 dist/（含 PWA manifest + Service Worker）
npm run preview    # 本地静态预览 dist/（http://localhost:4173）
```

要求 Node ≥ 20。构建产物 `dist/` 为纯静态文件，任意静态服务器可部署；
PWA（Service Worker / 安装到主屏幕）需要 HTTPS 或 localhost。

## 技术栈

Vue 3（`<script setup>` + Composition API）· Vite · JavaScript（无 TS）·
Tailwind CSS（响应式只用 `sm/md/lg/xl` 前缀，无手写媒体查询）· Pinia ·
Vue Router 4（hash 模式，静态部署友好）· ECharts + vue-echarts ·
localforage（IndexedDB）· lucide-vue-next（全部界面图标，无 emoji 图标）·
three.js（3D 魔方）· Vitest · vite-plugin-pwa。

## 功能清单（与小程序逐项对照）

| 功能 | 小程序 | Web 版 | 说明 |
|---|---|---|---|
| 3D 触摸转层 | ✅ threejs-miniprogram | ✅ three.js + Pointer Events | 表面滑动判定转层（拖动实时高亮将转的层）、空白拖拽转视角、中层默认关闭（设置可开） |
| 视角规则 | ✅ | ✅ | 页面内禁止自转；打乱先复位视角（白顶绿前）并全程锁定；复原 = 状态 + 视角复位 + 解锁自由玩 |
| WCA 打乱 | ✅ 随机状态（Worker 取逆） | ✅ 同 | Kociemba Worker 内随机状态多次求解取 ≤20 最短；Worker 不可用回退随机步；公式卡与动画同步高亮；暂停/继续/跳过动画；打乱中禁止手动转层；完成进入结果锁定 |
| 打乱/演示速度 | ✅ 0.5~10s/步（步进 0.5） | ✅ 同（速度卡片，两条滑动条互不影响） | 语义 = 每步总时长：转动固定 500ms + 等待剩余 |
| 看解法（八种） | ✅ | ✅ 八个独立标签 | ⚡最优解（Kociemba ≤22 步，LBL 兜底）/ 🚀CFOP / 🏆CFOP+ZBLL / 📚层先法 / 🌉桥式 / ⚡ZZ / 🧱Petrus / 🙈盲拧（字母串 + 字母对）；每标签含阶段公式列表 +「本次解法说明」（buildExplain idea+steps）+ 逐步演示（用演示速度设置）；演示必须从打乱完成态开始：打开面板记录起始 facelet，切标签/从头演示前先复位 |
| 计时挑战 | ✅ | ✅ | 3D 显示打乱后状态、禁止转层（可拖视角对照实体魔方）；Date.now 差值计时；停止即记录并复位（状态+视角） |
| WCA 赛场模式 | ✅ | ✅ | 15 秒观察（8/12 秒语音+震动提示，超 15s +2、超 17s DNF）→ 复原计时 → 5 次一轮按 WCA 规则去头尾算 ao5；单次/罚时/DNF 格式化；一轮结束出汇总 |
| 成绩 | ✅ 自绘 canvas 折线 | ✅ ECharts | 单次列表（罚时/DNF）、PB、ao5/ao12（去头尾）、平均、段位；折线趋势图（网格+渐变面积+均值参考线+PB 标记，≤20 点）+ 近 7 天柱状图（超限红标）；成绩卡 canvas 导出 PNG |
| 分步教学 | ✅ 7 课 | ✅ 7 课 | 每课三件套（3D 演示 / 口诀+公式 / 跟着做）；跟着做以 facelet 判定（十字/第一层/前两层/顶十字/顶面/角归位/复原七判定器）；过关解锁下一课、星级、XP |
| 公式卡 | ✅ | ✅ | 右手/左右插/小鱼/换位等 + 2-Look OLL + PLL；点开 3D 演示 + 口诀 + 用法 |
| 公式计时训练 | ✅ | ✅ | 任选公式连做 5 次，记录单次/平均/TPS，存个人最佳（PB） |
| 进阶解法 4 课 | ✅ | ✅ | 桥式/ZZ/Petrus/盲拧：思路 + 阶段表 + 关键公式卡 + 演示 + 跟着做（FB 左桥 / EOLine / 2×2×3 块 / 三循环复原判定器）；随时可看不锁 |
| ZBLL 页 | ✅ | ✅ | 知识讲解 + 1942 种公式按 5 个形态家族浏览（角全朝上 71 / 一角朝上 576 / 相邻两角 575 / 对角两角 288 / 四角 432）；每条显示待翻角位置与方向、待换位数、完整公式；40 条分页；分类用引擎 classifyKey |
| 拍照识别 | ✅ wx camera | ✅ getUserMedia + 相册兜底 | 引导 → 中心色标定（默认标准配色可逐面改）→ 六面拍摄（附「该怎么拿」3D 姿态示意）→ 四角拖拽 + 自动对齐（边缘能量多起点爬山）→ 单面识别确认 → 六面组装修正 → 3D 回显 → 求解 |
| 识别管线 | ✅ | ✅ 同一算法（引擎复制） | 照片缩样 240×240 → 每格中心 60% 取 5×5 子网格逐通道中位数 → 实测中心色做参照 + 白平衡归一 → 相对最近邻（色度×2.6 + 相对亮度×0.9）→ 不确定格打「?」→ 六面拍完统一重判 → 校验（每色 9 个/中心对/analyzeState 可解性）失败提示重拍哪个面；读取失败明确报错不静默 |
| 游戏化 | ✅ | ✅ | XP 与等级（6 级）、12 枚徽章（配置驱动 config/achievements.js 原样复用）、连续打卡、贴纸收藏墙；复原/完成课程触发庆祝动画 |
| 家长模式 | ✅ | ✅ | 4 位 PIN（可重置/关闭）；练习报告：累计复原、课程进度、连续打卡、近 7 天使用时长（ECharts 柱状图，超阈值红标）；每日时长提醒滑条；「今日练习计划」卡片支持导出分享图 |
| 我的 / 设置 | ✅ | ✅ | 音效/语音开关、打乱/演示速度（跳速度卡片）、色弱模式（高对比配色+图案符号 ●▬▲★✚◗）、大字号、中层转动开关；数据导出/导入 JSON；本机身份（昵称可改，本地净化） |
| 底部导航 | ✅ 自定义 tabBar | ✅ 底部三 tab（首页/学习/我的） | 玩转/计时/赛场/拍照为页面内入口（Web 单页路由） |
| 2x2 魔方 | ✅ | ➖ 不在范围 | 引擎的 cubeTypes/cube2 已随引擎复制保留，视图未开放切换（见「不做清单」） |

### Web 专属替代（无后端约束下）

| 小程序能力 | Web 替代 |
|---|---|
| 微信登录 | 本地匿名身份（自动生成 userID，可改昵称） |
| 微信同声传译 TTS | Web Speech Synthesis（zh-CN），不可用时文字降级（与小程序一致的降级策略） |
| wx 内音效文件 | Web Audio 实时合成：转动=160ms 木质"哒"（带通噪声瞬态+阻尼共鸣，±12% 随机音量）、成功/弹窗音 |
| 订阅消息（推送） | Web Push 接口已在 SW 生命周期内预留（需 HTTPS + 授权），当前版本未启用服务端 |
| 支付 | 不适用（小程序内亦无该业务） |

## 明确的不做清单

- **无后端、无账号体系**：不登录、不收集个人信息；身份为本地匿名 userID。
- **无多设备实时同步**：只有手动「导出/导入 JSON」快照（`{app:'magic-cube', version:1, exportedAt, data}`）。
- **无支付、无社交、无广告**（与小程序合规口径一致）。
- **2x2 魔方视图未开放**：任务范围以 3x3 为主；引擎副本仍完整保留 cube2/cubeTypes。
- **拍照识别的"跟做模式回拍核对"、AR 箭头叠加**：小程序的实验性方向（docs/AR-FEASIBILITY.md），未纳入。
- 无内容安全云函数（msgSecCheck 为小程序专属），昵称仅本地净化过滤。

## 引擎复制与更新说明

`src/engine/` 是小程序 `utils/` 与 `config/` 中**求解引擎与数据配置的零改动副本**，
仅做了 CommonJS → ES Module 的机械式转换（`require` → `import`、
`module.exports` → `export`；函数内惰性 require 一律提升为顶部 import，运行时才访问绑定，
循环依赖行为与原实现一致）。**全部逻辑与注释逐字保留**，
可运行 `node scripts/verify-engine.mjs` 校验注释逐字一致，`node scripts/convert-engine.mjs` 可从小程序源码重新生成。

| Web（src/engine/） | 来源（小程序） |
|---|---|
| cube.js / cubies.js / cube2.js / cubeTypes.js | utils/ 同名文件 |
| colorMatch.js / scanState.js / moveOpt.js / solveExplain.js / zbll.js | utils/ 同名文件 |
| lblSolver.js / cfopSolver.js / rouxSolver.js / zzSolver.js / petrusSolver.js / blindSolver.js / pieceSolver.js / advancedMethods.js | utils/ 同名文件 |
| scrambler.js / lessonCheck.js / wcaRules.js | utils/ 同名文件（依赖闭包与 Web 视图直接复用） |
| config/index.js / algLibrary.js / lessonData.js / zbllTable.js / achievements.js | config/ 同名文件（config/index.js 因对象字面量导出含行内注释，为手工等价转换） |

> 小程序如更新引擎：重跑 `node scripts/convert-engine.mjs`（源路径在脚本顶部 `SRC`），
> 再跑 `node scripts/verify-engine.mjs` 与 `npm run test`。

关键接口（与小程序逐字兼容，视图层直接调用）：

- `solveLbl(facelet) → { moves, stages:[{id,title,hint,from,moves}] }`
- `solveCFOP(facelet, { zbll?, twoLookPLL? }) → { moves, stages, pllOneLookName, zbll, solved }`
- `solveRoux/solveZZ/solvePetrus(facelet) → { moves, stages, solved, fallback }`
- `solveBlind(facelet) → { moves, stages, memo, solved }`
- `solveAdvanced(facelet, 'roux'|'zz'|'petrus'|'blind')`（失败自动"通用手法收尾"并如实标注 `lbl-tail`）
- `moveOpt.optimizeStages(startFacelet, moves, stages)`
- `matchZbll(facelet) → { applicable, found, key, name, moves }`
- `SE.buildExplain(kind, stages, { total, pllName, memo }) → { idea, steps }`

状态模型：54 字符 facelet（面序 U R F D L B，每面行优先）；转动记号 `URFDLB` + `'`/`2`，
支持中层 `M/E/S` 与宽层小写；默认视角白顶绿前（相机方向 ≈ (0.9, 0.85, 1.3)）。

## 数据架构（localforage / IndexedDB）

- 库名 `magic-cube`；键：`settings`、`records`、`lessons`、`xp`、`badges`、`stickers`、
  `drill`、`sync`，另有同语义内部键 `checkin`（打卡日历）、`playtime`（使用时长）、`parent`（家长 PIN）。
  所有对象写入附加 `updatedAt`。
- `settings`：`{ sound, voice, scrambleSec, demoSec, colorblind, largeFont, allowSlices, nickname }`
  （scrambleSec/demoSec 默认 0.5，范围 0.5~10、步进 0.5，写入前 `normalizeSec` 对齐步进并收敛边界）。
- `records.list[]`：`{ date, durationMs, mode:'free'|'timer'|'wca'|'scan'|'drill', penalty:'-'|'+2'|'DNF', cubeType, roundId?, scramble }`。
- 导出/导入 JSON：`{ app:'magic-cube', version:1, exportedAt, data:{...全部键} }`（我的 → 导出数据）。
- `sync` 键为同步令牌预留位（见不做清单：无自动同步）。

## 移植路线（实现对照）

```
小程序                                Web 版
utils/*（纯 JS 引擎）          →  src/engine/*（逐字复制 + ESM 化）
packageCube/utils/cube3d.js    →  src/composables/useCube3D.js（three.js + Pointer Events）
packageCube/utils/swipe.js     →  src/composables/swipe.js（逐字复制 + ESM 化）
utils/solver.js + workers/*    →  src/workers/kociemba.worker.js + composables/useKociemba.js
                                  （协议 postMessage{type:'solve'|'scramble'|'init'}，深 22；
                                   另扩展 solveAdvanced/solveLbl 通道；不可用回退层先法）
utils/store.js(records/game)   →  src/stores/*（Pinia + localforage，写入附 updatedAt）
utils/sound.js / voice.js      →  composables/useSound.js（Web Audio 合成）/ useVoice.js（SpeechSynthesis）
packageCube/pages/play.js      →  views/PlayView.vue + components/SolutionPanel.vue（八标签）
packageCube/pages/scan.js      →  views/ScanView.vue + composables/useScan.js（getUserMedia）
packageCube/pages/timer|wca|stats → views/TimerView.vue / WcaView.vue / StatsView.vue
pages/learn|lesson|formula|zbll|mine|parent|home → views/ 同名 .vue
config/achievements.js         →  引擎原样复用 + stores/game.js（配置驱动徽章引擎）
components/celebrate           →  App.vue CSS 彩带粒子（无 emoji 图标原则下庆祝文案除外）
```

## 测试（npm run test）

- **引擎等价**（与小程序 test/ 同口径）：
  - 20 例随机打乱 × {层先法 / CFOP / CFOP+ZBLL / Roux / ZZ / Petrus / 盲拧} 全部复原且回放一致；
  - ZBLL 表 ≥1900 条、抽验 200 条「匹配 → 应用 → 复原」全过（含情形键 ↔ 状态往返校验）；
  - 拍照识别合成场景（标准/暖光/冷光/昏暗/噪声/过曝）：相对分类 54/54、旧绝对法暖光 45/54 的回归、
    不确定标记可靠性、白平衡增益；
  - 速度语义（0.5~10s 步进 0.5 归一化；转动固定 500ms + 等待剩余；12s 截断回归）；
  - WCA 规则（观察罚时 / ao5 去头尾 / DNF / 格式化）、课程判定器、3D 数学（INT_ROT ↔ QUARTER 置换互检）、
    滑动判定（视角不变量、中层开关、阈值语义）。
- **组件契约**（jsdom + mock 控制器）：状态-first（打乱后 3D 状态 = 独立计算 facelet）、
  演示统一起点（切标签/从头演示先复位）、视角锁定与复位、跳过动画不重复应用剩余步。

## 目录结构

```
src/
├─ engine/                  # 小程序引擎零改动副本（见上表）+ config/
├─ workers/kociemba.worker.js   # Kociemba Worker（cubejs，深 22；scramble 多次求解取 ≤20 最短）
├─ stores/                  # Pinia：settings / records(+recordsMath) / lessons / game / ui / db(localforage)
├─ composables/             # useCube3D / useSound / useScramble / useDemo / useKociemba / useScan / useVoice / swipe
├─ router/index.js          # createWebHashHistory
├─ views/                   # Home / Play / Timer / Wca / Scan / Stats / Learn / Lesson / Zbll / Formula / Mine / Parent
├─ components/              # Cube3D / NetView(扫描网) / SolutionPanel / StageList(阶段并入面板) /
│                           # SpeedCard / RecordChart / WeekChart / FormulaCard
└─ assets/                  # 音效为 Web Audio 合成（无需音频文件）
```

> 注：`NetView` 的六面网格与阶段列表分别内聚在 `ScanView.vue`（修正网）与
> `SolutionPanel.vue`（阶段列表）中实现，未拆独立文件；`StageList` 同理。
