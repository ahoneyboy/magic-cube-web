/**
 * lessonData.js —— 层先法教学课程数据（P8，数据驱动）
 *
 * 7 个阶段，每阶段三件套：
 *   ① demo   —— 3D 动画演示：从 startState 出发播放 stageMoves（可由层先法求解器
 *               按 solveLbl 输出的同名阶段动态生成；这里为每课准备固定演示序列）
 *   ② tip    —— 一句话口诀 + 大字说明（儿童语言，无术语堆砌）
 *   ③ practice —— 跟着做：从 startScramble 开始操作虚拟魔方，lessonCheck 用
 *               facelet 判定是否达成阶段目标
 *
 * 朝向约定：全课程"白底黄顶"（白色=D 面朝下）——与 config 颜色一致：
 * U=白 D=黄 F=绿 B=蓝 R=红 L=橙；UI 上以"魔方朝向小图标"提示白底黄顶。
 */

const STAGES = [
  {
    id: 1,
    key: 'know',
    title: '认识魔方',
    emoji: '🧊',
    intro: '魔方有 6 种颜色，每个面中间的小方块叫"中心块"，它永远不会跑哦！',
    tip: '中心块不动，颜色都跟它走',
    keyPoint: '转一转：跟着下面两步玩，感受每一层',
    demo: {
      startState: null, // 复原态
      moves: ['R', 'U', "R'", "U'", 'F', 'U', "F'", "U'"],
      caption: '看！每次只有一层在转'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'"],
      goal: '随便转 6 下，找到每个面的中心块颜色',
      checkId: 'explore',
      hint: '慢慢转，看看每一层是怎么动的'
    }
  },
  {
    id: 2,
    key: 'cross',
    title: '白色十字',
    emoji: '✝️',
    intro: '先把 4 个白色棱块围到黄色中心周围，拼一个白色小十字。',
    tip: '白棱找朋友，对齐颜色再下来',
    keyPoint: '口诀：找到白棱 → 转到白面旁边 → 颜色对齐 → 翻下来',
    demo: {
      startState: null,
      moves: ["R'", 'F', 'U', 'F2', "L'", 'U', 'L', 'B2'],
      caption: '白棱一个个回到十字上'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L'],
      goal: '把白色十字拼到底面（白色朝下）',
      checkId: 'dCross',
      hint: '一次只管一个白棱块，对齐侧面颜色再翻下去'
    }
  },
  {
    id: 3,
    key: 'corners',
    title: '第一层角块',
    emoji: '🟨',
    intro: '把 4 个带白色的角块送回底面，第一层就完成啦。',
    tip: '角块站上位，右手公式来帮忙',
    keyPoint: '口诀：角块放到目标上方，一直做「右手公式」直到它回家',
    formula: 'sexy',
    demo: {
      startState: null,
      moves: ['R', 'U', 'R2', "F'", 'R', 'U', 'R2'],
      caption: '角块在上方，右手公式转进家'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L', 'B'],
      goal: '完成白色十字 + 四个角块（第一层全白）',
      checkId: 'firstLayer',
      hint: '角块先转到目标位置的上方，再重复右手公式 R U R\' U\''
    }
  },
  {
    id: 4,
    key: 'middle',
    title: '第二层棱块',
    emoji: '🟩',
    intro: '把 4 个不带黄色的棱块放进中间层。',
    tip: '棱块对颜色，左插右插送回家',
    keyPoint: '口诀：顶上对齐颜色 → 看它要去左边还是右边 → 做左插或右插',
    formula: 'rightInsert',
    demo: {
      startState: null,
      moves: ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],
      caption: '右插公式：棱块回家'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L', 'B', 'D2'],
      goal: '完成前两层（第一、二层全部归位）',
      checkId: 'twoLayers',
      hint: '先把棱块的侧面颜色对齐中心，再决定左插还是右插'
    }
  },
  {
    id: 5,
    key: 'ucross',
    title: '顶层十字',
    emoji: '✨',
    intro: '让顶面出现一个黄色十字（角块先不管）。',
    tip: '小拐角、一条线，十字公式转到见',
    keyPoint: '口诀：拐角放左上、一字横着放，做十字公式，最多三次',
    formula: 'ucross',
    demo: {
      startState: null,
      moves: ['F', 'R', 'U', "R'", "U'", "F'"],
      caption: '十字公式：F R U R\' U\' F\''
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L', 'B', 'D2', 'R2'],
      goal: '顶面出现黄色十字',
      checkId: 'uCross',
      hint: '看到"小拐角"就把它放在左上方再做公式'
    }
  },
  {
    id: 6,
    key: 'ucorners',
    title: '顶面同色 + 角块归位',
    emoji: '🎯',
    intro: '把顶面全部变黄，再让角块的侧面颜色对齐。',
    tip: '小鱼游一游，顶面黄澄澄',
    keyPoint: '口诀：小鱼公式（R U R\' U R U2 R\'）多游几次，顶面就黄了',
    formula: 'sune',
    demo: {
      startState: null,
      moves: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"],
      caption: '小鱼公式'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L', 'B', 'D2', 'R2', "F'"],
      goal: '顶面全黄 + 角块侧面颜色对齐',
      checkId: 'uFaceAndCorners',
      hint: '顶面翻色不管角块位置，翻完再对齐侧面颜色'
    }
  },
  {
    id: 7,
    key: 'finish',
    title: '完成复原',
    emoji: '🏆',
    intro: '最后一步：把顶层的棱块转到正确的位置，魔方就复原啦！',
    tip: '棱块转圈圈，转完就复原',
    keyPoint: '口诀：棱块换位公式，最多做三次，恭喜你学会复原！',
    formula: 'uperm',
    demo: {
      startState: null,
      moves: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'],
      caption: '棱块换位公式'
    },
    practice: {
      startScramble: ['R', 'U', "R'", "U'", 'F', 'L', 'B', 'D2', 'R2', "F'", 'U2'],
      goal: '完全复原整个魔方 🎉',
      checkId: 'solved',
      hint: '用最后学的棱块公式，转一圈回家'
    }
  }
];

// 公式卡库（P8-3）：点开可播放动画 + 文字 + 语音
const FORMULAS = {
  sexy: {
    name: '右手公式',
    icon: '✋',
    moves: ['R', 'U', "R'", "U'"],
    tip: '右手上、右手回，万能的小钥匙',
    usage: '第一层角块、顶面翻色都会用到它'
  },
  rightInsert: {
    name: '右插公式',
    icon: '➡️',
    moves: ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],
    tip: '棱块去右边，右插送回家',
    usage: '第二层棱块在右边时使用'
  },
  leftInsert: {
    name: '左插公式',
    icon: '⬅️',
    moves: ["U'", "L'", 'U', 'L', 'U', 'F', "U'", "F'"],
    tip: '棱块去左边，左插送回家',
    usage: '第二层棱块在左边时使用'
  },
  ucross: {
    name: '十字公式',
    icon: '✝️',
    moves: ['F', 'R', 'U', "R'", "U'", "F'"],
    tip: '小拐角、一条线，做一次变一点',
    usage: '顶层十字；最多做三次'
  },
  sune: {
    name: '小鱼公式',
    icon: '🐠',
    moves: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"],
    tip: '小鱼游啊游，游到顶面黄',
    usage: '顶面翻角块；"鱼头"朝左下再做'
  },
  antiSune: {
    name: '反小鱼',
    icon: '🐟',
    moves: ['R', 'U2', "R'", "U'", 'R', "U'", "R'"],
    tip: '小鱼往回游',
    usage: '顶面翻角块的另一种情况'
  },
  cornerPerm: {
    name: '角块换位',
    icon: '🔄',
    moves: ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'],
    tip: '角块排队换位置',
    usage: '顶面同色后，让角块侧面对齐'
  },
  uperm: {
    name: '棱块换位',
    icon: '🔁',
    moves: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'],
    tip: '棱块转圈圈，转完就复原',
    usage: '最后一步，棱块循环归位'
  }
};

// 进阶解法公式卡（四个新解法）
Object.assign(FORMULAS, {
  lseM: {
    name: 'LSE 中层换位',
    icon: '🌉',
    moves: ['M', "U'", 'M', "U'", 'M', 'U2', 'M', 'U', 'M', 'U', 'M', 'U2'],
    tip: '只用 M、U 两种转动，两座桥都不会散',
    usage: 'Roux 最后六条棱：先把中层棱块排好队（不改变棱的朝向）'
  },
  lseM2: {
    name: 'LSE 4b：UL·UR 归位',
    icon: '🎯',
    moves: ['M2', 'U2', 'M2', 'U2'],
    tip: 'M2 和 U2 轮着来，左右两条棱先回家',
    usage: 'Roux LSE 第二步：把 UL、UR 两条棱放到位置'
  },
  lseFinish: {
    name: 'LSE 收尾：中层归位',
    icon: '✨',
    moves: ['M2', 'U', 'M2', 'U2', 'M2', 'U', 'M2'],
    tip: 'M2 配 U/U2，最后四条棱也回家',
    usage: 'Roux LSE 第三步：做完魔方就复原啦'
  },
  zzF2L: {
    name: 'ZZ 的 F2L 插入',
    icon: '⚡',
    moves: ['U', 'R', "U'", "R'"],
    tip: '棱块朝向已经调好，只用 R/U/L 就能送角棱对回家',
    usage: 'ZZ 法第二层：全程不会用到 F、B（不用翻棱）'
  },
  cycleEdge: {
    name: '棱块三循环',
    icon: '🔁',
    moves: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'],
    tip: '三条棱顺次换位，别的块一动不动',
    usage: '盲拧：按字母串把棱块一块块送回家'
  },
  cycleCorner: {
    name: '角块三循环',
    icon: '🔄',
    moves: ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'],
    tip: '三个角顺次换位，其它块都不动',
    usage: '盲拧：角块按字母串送回家'
  },
  parityT: {
    name: '奇偶修正（T 型）',
    icon: '♻️',
    moves: ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"],
    tip: '最后剩"两角两棱互换"时，一条公式收掉',
    usage: '盲拧收尾：处理奇偶情况'
  }
});

// 进阶解法课程（四个新解法）：每个解法一课，内容 = 思路 + 阶段表 + 关键公式 + 演示 + 跟着做
const ADVANCED = [
  {
    id: 101,
    key: 'roux',
    group: 'advanced',
    title: '桥式 Roux',
    emoji: '🌉',
    intro: '先左右各搭一个 1×2×3 的"桥"，再用 M/U 把剩下六条棱收掉——转动幅度特别小。',
    tip: '先搭两座桥，最后 M/U 收六棱',
    idea:
      '思路：桥式法把魔方拆成"两座桥 + 顶层角 + 六条棱"。' +
      '① FB 左桥：左边搭一个 1×2×3 的长条（角块棱块一起拼，不用先拼十字）；' +
      '② SB 右桥：右边再搭一个，注意别弄坏左桥；' +
      '③ CMLL：顶层四个角一次性归位（只动顶层角，棱块先不管）；' +
      '④ LSE：剩下六条棱只用 M、U 两种转动收掉——这是桥式最帅的地方，转动幅度小、很适合单手。',
    keyPoint: '口诀：左右两座桥 → 顶层角一次归位 → M/U 收六棱',
    stageList: [
      { emoji: '🌉', name: 'FB 左桥', desc: '左侧 1×2×3：1 条底棱 + 2 条中层棱 + 2 个底角（自由度高，怎么顺手怎么来）' },
      { emoji: '🌉', name: 'SB 右桥', desc: '右侧再搭一个 1×2×3，全程注意别破坏左桥' },
      { emoji: '🧠', name: 'CMLL 顶层角', desc: '用公式让顶层四个角一次归位（棱块此时乱着也没关系）' },
      { emoji: '🔄', name: 'LSE 最后六棱', desc: '只用 M/U：翻棱 → 归位 UL·UR → 中层收尾' }
    ],
    formulas: ['lseM', 'lseM2', 'lseFinish'],
    demo: {
      scramble: ['L2', "D'", 'B', 'U2', "L'"],
      moves: ['U2', 'L2', 'U', "L'", 'U2', 'L', 'U', 'L2', 'U2', 'L', 'U2', 'L', 'U', 'M', "U'", 'L'],
      caption: 'FB 左桥：角块棱块一起拼',
      segments: [{ title: 'FB 左桥', from: 0, len: 16 }]
    },
    practice: {
      startScramble: ['L2', "D'", 'B', 'U2', "L'"],
      goal: '搭好左桥 FB：左侧 1×2×3 的角块和棱块全部到位',
      checkId: 'blockFB',
      hint: '先放 DL 底棱 → 两个底角（DBL、DLF）→ 两条中层棱（BL、FL），只用 U/L/M 就不会碰到右边'
    }
  },
  {
    id: 102,
    key: 'zz',
    group: 'advanced',
    title: 'ZZ 法',
    emoji: '⚡',
    intro: '开局先把 12 条棱的朝向全部调正，之后全程不用翻棱，前两层只用 R/U/L 三种转动。',
    tip: '先调棱朝向，后面不用翻棱',
    idea:
      '思路：ZZ 法的关键是"先做朝向"。' +
      '① EOLine：把 12 条棱的朝向全部调正（只用 R/L/U/D 就不会破坏朝向），顺便把 DF、DB 两条底棱放好，形成一条"直线"；' +
      '② F2L：因为棱的朝向已经对了，前两层只用 R/U/L 就能完成，不需要 F/B，也不用翻棱；' +
      '③ OCLL + PLL：顶层棱块本来就是朝上的，所以顶层十字自动成立，只需角块翻色再归位。',
    keyPoint: '口诀：先定朝向（EOLine）→ R/U/L 补前两层 → 顶层两组公式',
    stageList: [
      { emoji: '⚡', name: 'EOLine① 棱定向', desc: '12 条棱的朝向全部调正（只用 R/L/U/D，这两组转动不会翻棱）' },
      { emoji: '📏', name: 'EOLine② 归位底线', desc: '把 DF、DB 两条底棱放好，形成直线' },
      { emoji: '🧩', name: 'F2L（只用 R/U/L）', desc: '四组角棱对 + DL/DR 两条底棱，因为不用翻棱所以顺手' },
      { emoji: '🟡', name: 'OCLL 角翻色', desc: '顶层棱块早已朝上，只需把角块翻好' },
      { emoji: '🎯', name: 'PLL 归位', desc: '公式库识别情形，一条公式让顶层归位' },
      { emoji: '🏆', name: 'ZBLL（进阶更省）', desc: '棱朝向已好时，顶层角翻色 + 角棱归位可以合成一条 ZBLL 公式完成（公式表覆盖 1942 种情形）' }
    ],
    formulas: ['zzF2L', 'sune'],
    demo: {
      scramble: ['R', 'U2', 'F', "D'", 'B', 'R'],
      moves: ['R', 'B', 'D', 'F', 'U', 'L2', 'D2', 'U', 'L2', "D'"],
      caption: 'EOLine：先把棱的朝向调正，再放好底线两条棱',
      segments: [{ title: 'EOLine', from: 0, len: 10 }]
    },
    practice: {
      startScramble: ['R', 'U2', 'F', "D'", 'B', 'R'],
      goal: '完成 EOLine：12 条棱朝向全对（U/D 色朝上下）+ DF、DB 两条底棱归位',
      checkId: 'eoline',
      hint: '只用 R/L/U/D 转动（F/B 会翻棱）；先不管位置把朝向翻对，再把 DF、DB 放好'
    }
  },
  {
    id: 103,
    key: 'petrus',
    group: 'advanced',
    title: 'Petrus（彼得鲁斯法）',
    emoji: '🧱',
    intro: '先拼一个 2×2×3 的大方块，再修棱的朝向，最后只用 R/U/L 补完剩下的部分。',
    tip: '先搭大方块，再修棱朝向',
    idea:
      '思路：彼得鲁斯法把复原拆成"搭积木 + 修朝向 + 补剩余"。' +
      '① 2×2×3 大块：在左下角一次拼出 2 个角 + 5 条棱的大方块（角块棱块一起搭，不用先十字）；' +
      '② 棱定向：把剩下 7 条棱的朝向调正（优先只用 R/U 两种转动），之后不会被翻棱卡住；' +
      '③ 完成前两层：只用 R/U/L 把右层的两条底棱和两组角棱对补上；' +
      '④ 顶层：OLL 翻色 + PLL 归位两组公式收尾。',
    keyPoint: '口诀：搭 2×2×3 → 修朝向 → R/U/L 补前两层 → 顶层两组公式',
    stageList: [
      { emoji: '🧱', name: '2×2×3 大块', desc: '2 个角 + 5 条棱一次搭好（自由度高，可以先搭一部分再补）' },
      { emoji: '⚡', name: '棱定向 EO', desc: '剩下 7 条棱朝向调正，之后不用再管翻棱' },
      { emoji: '🧩', name: '完成前两层', desc: 'DR 底棱 + 右层两组角棱对，只用 R/U/L' },
      { emoji: '🟡', name: '顶层 OLL', desc: '先翻顶层棱、再翻顶层角（两步式，公式简单）' },
      { emoji: '🎯', name: '顶层 PLL', desc: '角块、棱块归位，魔方复原' }
    ],
    formulas: ['sune', 'parityT'],
    demo: {
      scramble: ['B', 'R', 'D', 'B', 'F'],
      moves: ["F'", "D'", "U'", 'B', 'D', 'B2', "D'", "R'", "L'", "B'", 'L'],
      caption: '2×2×3 大块：2 个角 + 5 条棱一起搭',
      segments: [{ title: '2×2×3 大块', from: 0, len: 11 }]
    },
    practice: {
      startScramble: ['B', 'R', 'D', 'B', 'F'],
      goal: '搭好 2×2×3 大块（2 个角 + 5 条棱到位）',
      checkId: 'block223',
      hint: '先把 DL 底棱放好 → 两个底角 → 两条中层棱 → 最后补 DF、DB 两条底棱'
    }
  },
  {
    id: 104,
    key: 'blind',
    group: 'advanced',
    title: '盲拧（三循环）',
    emoji: '🙈',
    intro: '不靠眼睛：先把每个块该去的位置编成字母，再按字母串一块块送回家。',
    tip: '先背字母，再闭眼复原',
    idea:
      '思路：盲拧不靠手快，靠"编码"。' +
      '① 字母表：给魔方每一张贴纸起一个字母（本项目用 Speffz 风格：角块缓冲 ULB = A，棱块缓冲 UB = A）；' +
      '② 记忆：从缓冲块出发，看它该去哪 → 写出那个位置的字母 → 继续看下一个，串成字母串/字母对；' +
      '③ 复原：每次用「setup 转到顺手的位置 + 纯三循环公式 + 还原 setup」，把一块送回家，公式只动三个块，不会破坏已完成的；' +
      '④ 奇偶修正：如果最后剩"两角两棱互换"，用一条 T 型公式收掉。' +
      '新手可以先"看着字母做"，熟练后就能闭眼了。',
    keyPoint: '口诀：编码 → 逐块三循环 → 奇偶收尾',
    stageList: [
      { emoji: '🔤', name: '字母编码', desc: '把每张贴纸编成字母，按缓冲块走一圈写出字母串（这是盲拧真正要背的东西）' },
      { emoji: '🔁', name: '棱块三循环', desc: '按字母顺序，每次用「setup + 棱三循环 + 还原 setup」送一块回家' },
      { emoji: '🔄', name: '角块三循环', desc: '角块同样处理（角三循环公式只动三个角）' },
      { emoji: '♻️', name: '奇偶修正', desc: '最后剩两角两棱互换时，一条 T 型公式一次收掉' }
    ],
    formulas: ['cycleEdge', 'cycleCorner', 'parityT'],
    demo: {
      scramble: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'],
      moves: ['R2', 'U', 'R', 'U', "R'", "U'", "R'", "U'", "R'", 'U', "R'"],
      caption: '棱块三循环：三条棱顺次换位，其它块一动不动',
      segments: [{ title: '棱块三循环', from: 0, len: 11 }]
    },
    practice: {
      startScramble: ['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'],
      goal: '用一次棱块三循环，把三条错位的棱送回家（魔方复原）',
      checkId: 'solved',
      hint: "做「棱块三循环」公式：R2 U R U R' U' R' U' R' U R'（只动三条棱，其它块不会乱）"
    }
  }
];

export { STAGES, FORMULAS, ADVANCED };
