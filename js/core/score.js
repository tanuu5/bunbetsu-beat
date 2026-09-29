// 得点、コンボ、フィーバー、エコゲージ、評価。

import { CONFIG } from '../config.js';

/** コンボに応じた倍率。 */
export function comboMultiplier(combo, sc = CONFIG.score) {
  return Math.min(sc.multiplierMax, 1 + sc.multiplierStep * Math.floor(combo / sc.multiplierEvery));
}

/** 正確さから評価を決める。 */
export function rankFor(accuracy, sc = CONFIG.score) {
  for (const r of sc.ranks) if (accuracy >= r.min - 1e-9) return r.rank;
  return sc.ranks[sc.ranks.length - 1].rank;
}

/**
 * @param {{ difficulty: import('../config.js').Difficulty, spb: number, totalItems: number, config?: typeof CONFIG }} opts
 */
export function createScore({ difficulty, spb, totalItems, config = CONFIG }) {
  const sc = config.score;
  const g = config.gauge;
  const diff = config.difficulties[difficulty];
  const feverLength = sc.feverBars * config.beatsPerBar * spb;

  const s = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    gauge: g.start,
    counts: { perfect: 0, good: 0, safe: 0, miss: 0, empty: 0 },
    feverUntil: -Infinity,
    feverCharge: 0, // フィーバーの外で積んだコンボ
    feverCount: 0,
    /** @type {Record<string, { total: number, correct: number }>} */
    perType: {},
    gameOver: false,
  };

  const isFever = (t) => t < s.feverUntil;

  /**
   * 判定を 1 つ反映する。
   * @param {import('./judge.js').JudgeEvent} ev
   */
  function apply(ev) {
    const out = { points: 0, multiplier: 1, fever: false, feverStarted: false, comboMilestone: false, gameOver: false };
    if (ev.kind === 'empty') {
      s.counts.empty++;
      return out; // からぶりはコンボを切らない
    }
    const t = ev.item.time; // 目標時刻を基準にすると、同じ入力なら同じ結果になる
    const type = ev.item.type;
    const pt = (s.perType[type] ??= { total: 0, correct: 0 });
    pt.total++;
    s.counts[ev.kind]++;

    if (ev.kind === 'miss') {
      s.combo = 0;
      s.feverCharge = 0;
      s.gauge = Math.max(0, s.gauge - diff.missLoss);
      if (s.gauge <= 0 && diff.endOnZeroGauge) s.gameOver = true;
    } else {
      pt.correct++;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.gauge = Math.min(g.max, s.gauge + g.gain[ev.kind]);
      if (!isFever(t)) {
        s.feverCharge++;
        if (s.feverCharge >= sc.feverCombo) {
          s.feverUntil = t + feverLength;
          s.feverCharge = 0;
          s.feverCount++;
          out.feverStarted = true;
        }
      }
      out.multiplier = comboMultiplier(s.combo, sc);
      out.fever = isFever(t);
      out.points = Math.round(sc.points[ev.kind] * out.multiplier * (out.fever ? sc.feverMultiplier : 1));
      out.comboMilestone = s.combo % sc.multiplierEvery === 0;
      s.score += out.points;
    }
    out.gameOver = s.gameOver;
    return out;
  }

  function accuracy() {
    if (totalItems <= 0) return 0;
    const c = s.counts;
    return (c.perfect + c.safe + c.good * sc.goodAccuracyWeight) / totalItems;
  }

  function result() {
    const acc = accuracy();
    const c = s.counts;
    /** @type {Record<string, number>} */
    const typeAccuracy = {};
    for (const [type, v] of Object.entries(s.perType)) typeAccuracy[type] = v.total ? v.correct / v.total : 0;
    let weakest = null;
    for (const [type, a] of Object.entries(typeAccuracy)) if (a < 1 && (weakest === null || a < typeAccuracy[weakest])) weakest = type;
    return {
      score: s.score,
      accuracy: acc,
      rank: rankFor(acc, sc),
      perfectTitle: totalItems > 0 && c.perfect + c.safe === totalItems,
      counts: { ...c },
      maxCombo: s.maxCombo,
      typeAccuracy,
      weakestType: weakest,
      cleared: !s.gameOver,
    };
  }

  return {
    apply,
    result,
    accuracy,
    isFever,
    get state() {
      return s;
    },
  };
}
