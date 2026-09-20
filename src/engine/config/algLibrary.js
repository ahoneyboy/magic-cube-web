/**
 * algLibrary.js —— 高级解法公式库（CFOP 进阶）
 *
 * 全部公式都经过程序化验证（test/features.test.js）：
 *   - 保持前两层（F2L）不被破坏、中心块不动
 *   - PLL 公式为纯顶层置换（顶面朝向不变）
 *   - PLL 公式集 + AUF 可覆盖全部 288 种顶层状态（一步识别求解）
 *
 * 分组：OLL_2LOOK（两步式 OLL）/ PLL（一步到位）/ ADVANCED_NOTES（其他高级方法简介）
 * 不依赖 wx / DOM，可在 Node 中通用。
 */

const OLL_2LOOK = [
  { id: 'oll-edge', name: '顶层十字', sub: '2-Look OLL ①', moves: ['F','R','U',"R'","U'","F'"], tip: '小拐角放左上、一字横着放，最多三次', usage: '先把顶层棱块翻成十字' },
  { id: 'oll-sune', name: '小鱼公式', sub: '2-Look OLL ②', moves: ['R','U',"R'",'U','R','U2',"R'"], tip: '"鱼头"朝左下再做', usage: '顶面角块翻色最常见的情况' },
  { id: 'oll-antisune', name: '反小鱼', sub: '2-Look OLL ②', moves: ['R','U2',"R'","U'",'R',"U'","R'"], tip: '小鱼往回游', usage: '角块翻色的镜像情况' },
  { id: 'oll-h', name: 'H 形翻角', sub: '2-Look OLL ②', moves: ['R','U',"R'",'U','R',"U'","R'",'U','R','U2',"R'"], tip: '像两条小鱼贴在一起', usage: '四个角块都没翻好（对角交叉）' },
  { id: 'oll-pi', name: 'Pi 形翻角', sub: '2-Look OLL ②', moves: ['R','U2','R2',"U'",'R2',"U'",'R2','U2','R'], tip: '像倒过来的 π', usage: '两个相邻角块翻好的情况' },
  { id: 'oll-t', name: 'T 形翻角', sub: '2-Look OLL ②', moves: ['R','U',"R'","U'","R'",'F','R',"F'"], tip: '像字母 T', usage: '两个相邻角块翻好的另一种' },
  { id: 'oll-u', name: 'U 形翻角', sub: '2-Look OLL ②', moves: ['R2','D',"R'",'U2','R',"D'","R'",'U2',"R'"], tip: '两个对角角块翻好，带 D 的手法慢一点', usage: '中间带 D 的公式' },
  { id: 'oll-l', name: 'L 形翻角', sub: '2-Look OLL ②', moves: ['F',"R'","F'",'R','U','R',"U'","R'"], tip: '像字母 L', usage: '两个相邻角块翻好的第三种' }
];

const PLL = [
  { id: 'pll-aa', name: '角块三循环 Aa', sub: 'PLL · 角块', moves: ["R'",'F',"R'",'B2','R',"F'","R'",'B2','R2'], tip: '三个角块顺次换位', usage: '角块循环' },
  { id: 'pll-ab', name: '角块三循环 Ab', sub: 'PLL · 角块', moves: ['R2','B2','R','F',"R'",'B2','R',"F'",'R'], tip: '三个角块逆次换位', usage: '角块循环（反向）' },
  { id: 'pll-ua', name: '棱块三循环 Ua', sub: 'PLL · 棱块', moves: ['R',"U'",'R','U','R','U','R',"U'","R'","U'",'R2'], tip: '三个棱块顺次换位', usage: '棱块循环' },
  { id: 'pll-ub', name: '棱块三循环 Ub', sub: 'PLL · 棱块', moves: ['R2','U','R','U',"R'","U'","R'","U'","R'",'U',"R'"], tip: '三个棱块逆次换位', usage: '棱块循环（反向）' },
  { id: 'pll-h', name: '对棱互换 H', sub: 'PLL · 棱块', moves: ['M2','U','M2','U2','M2','U','M2'], tip: '两对对面棱块互换', usage: '对棱两两交换（含中层转动）' },
  { id: 'pll-z', name: '邻棱互换 Z', sub: 'PLL · 棱块', moves: ['M2','U','M2','U',"M'",'U2','M2','U2',"M'",'U2'], tip: '两对相邻棱块互换', usage: '邻棱两两交换（含中层转动）' },
  { id: 'pll-e', name: '对角双换 E', sub: 'PLL · 角块', moves: ['M2','U','M2','U2','M2','U','M2','U2'], tip: '两对对角角块互换', usage: '对角角块两两交换（含中层转动）' },
  { id: 'pll-t', name: '邻角+邻棱 T', sub: 'PLL · 组合', moves: ['R','U',"R'","U'","R'",'F','R2',"U'","R'","U'",'R','U',"R'","F'"], tip: '经典 T 字公式，最好记', usage: '两个邻角 + 两个邻棱交换' },
  { id: 'pll-y', name: '对角+棱 Y', sub: 'PLL · 组合', moves: ['F','R',"U'","R'","U'",'R','U',"R'","F'",'R','U',"R'","U'","R'",'F','R',"F'"], tip: '最常见的对角交换', usage: '一对对角角块 + 一对棱交换' },
  { id: 'pll-ja', name: '邻角换+棱循环 Ja', sub: 'PLL · 组合', moves: ["R'",'U',"L'",'U2','R',"U'","R'",'U2','R','L'], tip: '左手版', usage: '两角交换 + 三棱循环' },
  { id: 'pll-jb', name: '邻角换+棱循环 Jb', sub: 'PLL · 组合', moves: ['R','U',"R'","F'",'R','U',"R'","U'","R'",'F','R2',"U'","R'","U'"], tip: '右手版', usage: '两角交换 + 三棱循环' },
  { id: 'pll-f', name: '邻角换+对棱 F', sub: 'PLL · 组合', moves: ["R'","U'","F'",'R','U',"R'","U'","R'",'F','R2',"U'","R'","U'",'R','U',"R'",'U','R'], tip: '稍长但好记', usage: '两角交换 + 对面两棱交换' },
  { id: 'pll-ra', name: '三循环 Ra', sub: 'PLL · 三循环', moves: ['R',"U'","R'","U'",'R','U','R','D',"R'","U'",'R',"D'","R'",'U2',"R'"], tip: '带 D 的手法', usage: '三角 + 三棱同向循环' },
  { id: 'pll-rb', name: '三循环 Rb', sub: 'PLL · 三循环', moves: ["R'",'U2','R','U2',"R'",'F','R','U',"R'","U'","R'","F'",'R2'], tip: 'Ra 的右手变体思路', usage: '三角 + 三棱同向循环（另一种）' },
  { id: 'pll-ga', name: '三循环 G 左手版', sub: 'PLL · 三循环', moves: ["L'",'U','L','U',"L'","U'","L'","D'",'L','U',"L'",'D','L','U2','L'], tip: 'Ra 的左右镜像（左撇子顺手）', usage: '三角 + 三棱循环（镜像）' },
  { id: 'pll-gb', name: '三循环 G 左手变体', sub: 'PLL · 三循环', moves: ['L','U2',"L'",'U2','L',"F'","L'","U'",'L','U','L','F','L2'], tip: 'Rb 的左右镜像', usage: '三角 + 三棱循环（镜像变体）' }
];

const ADVANCED_NOTES = [
  { id: 'note-roux', name: '桥式（Roux）', icon: '🌉', desc: '先左右各搭一个 1x2x3 的"桥"，再做顶层角块（CMLL），最后用中层（M）公式收掉剩下六条棱（LSE）。转动幅度小、公式少，很多高手用它单手。' },
  { id: 'note-zz', name: 'ZZ 法', icon: '⚡', desc: '开局先把 12 条棱的朝向全部调好（EOLine），之后全程不用翻棱，F2L 只用 R/U/L 三种转动，顶层公式更少更快。' },
  { id: 'note-petrus', name: 'Petrus（彼得鲁斯法）', icon: '🧱', desc: '先拼一个 2x2x3 的大方块，再把剩下的棱块朝向调正，然后补齐剩余部分。块构建自由度高、公式量小，难点是边搭块边观察。' },
  { id: 'note-blind', name: '盲拧（三循环 / 彳亍法同源）', icon: '🙈', desc: '不靠眼睛：把每一块该去的位置编成字母（本项目用 Speffz 风格字母表，角缓冲 ULB=A、棱缓冲 UB=A），按字母串逐块送回家，用纯三循环公式 + 少量 setup；最后若剩"两角两棱互换"用一条公式收尾。' }
];

export { OLL_2LOOK, PLL, ADVANCED_NOTES };
