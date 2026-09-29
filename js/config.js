// 調整する数値のすべて。時間は特に断りがなければ秒。

/** @typedef {'left'|'right'|'down'|'up'} Dir */
/** @typedef {'burn'|'plastic'|'can'|'pet'|'keep'} ItemType */
/** @typedef {'easy'|'normal'|'hard'} Difficulty */

export const CONFIG = {
  /** 種類ごとの方向と色。keep（捨てないもの）は方向を持たない。 */
  types: {
    burn:    { dir: 'left',  color: '#E8553D' },
    plastic: { dir: 'right', color: '#F2B630' },
    can:     { dir: 'down',  color: '#2F80ED' },
    pet:     { dir: 'up',    color: '#27AE60' },
    keep:    { dir: null,    color: '#FF9EC4' },
  },

  /** 流れてくるものの一覧（必須の範囲）。名前は i18n.js にある。 */
  kinds: {
    burn:    ['banana', 'appleCore', 'fishBone', 'paperBall'],
    plastic: ['bentoBox', 'shoppingBag', 'eggPack', 'snackBag'],
    can:     ['juiceCan', 'tinCan', 'glassBottle', 'jamJar'],
    pet:     ['petSmall', 'petLarge', 'petSquare', 'petCrushed'],
    keep:    ['chick', 'cat'],
  },

  difficulties: {
    easy:   { bpm: 100, judge: 'standard', assistPhases: [1, 2, 3, 4], showNames: true,  endOnZeroGauge: false, missLoss: 6,  allowMixedEighths: false },
    normal: { bpm: 120, judge: 'standard', assistPhases: [1, 2],       showNames: false, endOnZeroGauge: true,  missLoss: 10, allowMixedEighths: false },
    hard:   { bpm: 140, judge: 'narrow',   assistPhases: [],           showNames: false, endOnZeroGauge: true,  missLoss: 10, allowMixedEighths: true },
  },
  defaultDifficulty: 'normal',

  /** 判定幅（秒、± の片側）。good の幅を過ぎたら見逃し。 */
  judgeWindows: {
    standard: { perfect: 0.060, good: 0.130 },
    narrow:   { perfect: 0.045, good: 0.100 },
  },

  score: {
    points: { perfect: 100, good: 60, safe: 100, miss: 0 },
    multiplierStep: 0.1,   // コンボ 10 ごとに増える倍率
    multiplierEvery: 10,
    multiplierMax: 2.0,
    feverCombo: 30,
    feverBars: 8,
    feverMultiplier: 2,
    goodAccuracyWeight: 0.6,
    ranks: [
      { rank: 'S', min: 0.95 },
      { rank: 'A', min: 0.85 },
      { rank: 'B', min: 0.70 },
      { rank: 'C', min: 0 },
    ],
  },

  gauge: { max: 100, start: 70, gain: { perfect: 2, good: 1, safe: 2 }, lowWarn: 20 },

  /** 曲の構成（4 分の 4 拍子）。reveal は切り替えの小節で登場するもの。 */
  beatsPerBar: 4,
  structure: [
    { id: 'count',  bars: 2 },
    { id: 'phase',  bars: 8,  phase: 1 },
    { id: 'switch', bars: 1,  reveal: 'can' },
    { id: 'phase',  bars: 8,  phase: 2 },
    { id: 'switch', bars: 1,  reveal: 'pet' },
    { id: 'phase',  bars: 12, phase: 3 },
    { id: 'switch', bars: 1,  reveal: 'keep' },
    { id: 'phase',  bars: 12, phase: 4 },
    { id: 'ending', bars: 2 },
  ],
  /** 段階ごとに流れてくる種類。前の段階にない種類が「新しく登場した種類」。 */
  phaseTypes: {
    1: ['burn', 'plastic'],
    2: ['burn', 'plastic', 'can'],
    3: ['burn', 'plastic', 'can', 'pet'],
    4: ['burn', 'plastic', 'can', 'pet', 'keep'],
  },

  /** リズムの型。8 分音符 8 個ぶんのマス目。1 = ゴミを置く。 */
  patterns: {
    easy:   [[1,0,0,0,1,0,0,0], [1,0,0,0,1,0,1,0]],
    normal: [[1,0,1,0,1,0,1,0], [1,0,1,0,1,0,0,0], [1,0,0,0,1,0,1,0]],
    dense:  [[1,0,1,1,1,0,1,0], [1,1,1,0,1,0,1,0], [1,0,1,0,1,1,1,0]],
  },
  /** 難しさ × 段階ごとの、型の種類の選ばれやすさ。 */
  patternWeights: {
    easy:   { 1: { easy: 1 }, 2: { easy: 1, normal: 1 }, 3: { normal: 1 },           4: { normal: 3, dense: 1 } },
    normal: { 1: { easy: 1 }, 2: { normal: 1 },          3: { normal: 3, dense: 1 }, 4: { normal: 1, dense: 1 } },
    hard:   { 1: { easy: 1, normal: 1 }, 2: { normal: 1 }, 3: { normal: 1, dense: 1 }, 4: { normal: 1, dense: 2 } },
  },
  chartRules: {
    maxSameDirRun: 3,          // 同じ方向は 4 回以上続けない
    keepRatioMin: 0.10,        // 捨てないものの割合（第 4 段階の中で）
    keepRatioMax: 0.15,
  },

  /** 出現から判定位置までの拍数。スキャンの門は判定位置の何拍手前か。 */
  approachBeats: 4,
  scanGateBeats: 2,

  flick: { thresholdPx: 24, tapTimeoutMs: 300 },

  audio: {
    lookaheadMs: 25,           // 予約の間隔
    scheduleAheadSec: 0.1,     // どれだけ先まで予約するか
    startDelaySec: 0.25,       // スタートを押してから曲の時刻 0 までの余裕
    clockResyncSec: 0.03,      // 時計の対応がこれ以上ずれたら、なめらかにせず合わせ直す
    clockSmoothing: 0.05,
  },

  timingOffset: { min: -200, max: 200, step: 5 },

  vibration: { successMs: 15, missMs: 40 },

  judgeTextSec: 0.4,
  maxPixelRatio: 2,
};

/** 難しさに応じた判定幅を返す。 */
export function judgeWindowsFor(difficulty) {
  return CONFIG.judgeWindows[CONFIG.difficulties[difficulty].judge];
}
