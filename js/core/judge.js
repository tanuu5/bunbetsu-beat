// 判定。時刻はすべて曲の時刻（秒）で受け取る。

const EPS = 1e-9;

/**
 * @typedef {object} JudgeEvent
 * @property {'perfect'|'good'|'safe'|'miss'|'empty'} kind
 *   empty = からぶり（判定幅の中にゴミがない入力）
 * @property {'wrong'|'late'|'touched'} [reason]
 *   miss の理由。wrong = 違う方向、late = 見逃し、touched = 捨てないものに入力した
 * @property {import('./chart.js').ChartItem} [item]
 * @property {import('../config.js').Dir} [dir] 入力した方向
 * @property {number} [delta] 入力時刻 − 目標時刻（秒）。入力のない判定では undefined
 * @property {number} time   判定が決まった時刻（入力時刻、または見逃しを確定した時刻）
 */

/**
 * 入力 1 回ぶんの判定を、ゴミ 1 個に対して行う。
 * @param {import('./chart.js').ChartItem} item
 * @param {import('../config.js').Dir} dir
 * @param {number} t
 * @param {{ perfect: number, good: number }} windows
 * @returns {JudgeEvent}
 */
export function judgeHit(item, dir, t, windows) {
  const delta = t - item.time;
  if (item.dir === null) return { kind: 'miss', reason: 'touched', item, dir, delta, time: t };
  if (item.dir !== dir) return { kind: 'miss', reason: 'wrong', item, dir, delta, time: t };
  const kind = Math.abs(delta) <= windows.perfect + EPS ? 'perfect' : 'good';
  return { kind, item, dir, delta, time: t };
}

/**
 * 譜面 1 回ぶんの判定の状態を持つ。
 * @param {import('./chart.js').ChartItem[]} items 目標時刻の順に並んでいること
 * @param {{ perfect: number, good: number }} windows
 */
export function createJudge(items, windows) {
  const judged = new Set();
  let cursor = 0; // これより前は、すべて判定済みか見逃し済み

  /** t までに判定幅を過ぎたゴミを、見逃し（捨てないものならセーフ）にする。 */
  function update(t) {
    /** @type {JudgeEvent[]} */
    const events = [];
    while (cursor < items.length && t - items[cursor].time > windows.good + EPS) {
      const item = items[cursor];
      if (!judged.has(item.id)) {
        judged.add(item.id);
        const time = item.time + windows.good;
        events.push(item.dir === null ? { kind: 'safe', item, time } : { kind: 'miss', reason: 'late', item, time });
      }
      cursor++;
    }
    return events;
  }

  /** 判定幅の中で、目標時刻が t に最も近い未判定のゴミ。なければ null。 */
  function findTarget(t) {
    let best = null;
    let bestAbs = Infinity;
    for (let i = cursor; i < items.length; i++) {
      const item = items[i];
      const d = item.time - t;
      if (d > windows.good + EPS) break;
      if (judged.has(item.id)) continue;
      const a = Math.abs(d);
      if (a <= windows.good + EPS && a < bestAbs) {
        best = item;
        bestAbs = a;
      }
    }
    return best;
  }

  /**
   * 方向の入力を 1 回判定する。先に t までの見逃しを確定させるので、
   * 返す配列は起きた順に並んでいる（最後が今回の入力の結果）。
   * @param {import('../config.js').Dir} dir
   * @param {number} t
   */
  function input(dir, t) {
    const events = update(t);
    const item = findTarget(t);
    if (!item) {
      events.push({ kind: 'empty', dir, time: t });
      return events;
    }
    judged.add(item.id);
    events.push(judgeHit(item, dir, t, windows));
    return events;
  }

  return {
    update,
    input,
    findTarget,
    isJudged: (id) => judged.has(id),
    get done() {
      return judged.size >= items.length;
    },
  };
}
