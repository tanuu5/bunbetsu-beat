// フリックとタップの方向を決める。指（ポインター）ごとに状態を持ち、複数の指を別々に扱う。
// 時刻は performance.now() と同じ基準のミリ秒で受け取る。

import { CONFIG } from '../config.js';

/**
 * 動いた量から方向を決める。横と縦の大きいほう。
 * @returns {import('../config.js').Dir}
 */
export function dirFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down'; // 画面の座標は下が +
}

/**
 * @typedef {{ type: 'flick', id: number, dir: import('../config.js').Dir, time: number }
 *         | { type: 'tap', id: number, x: number, y: number, time: number }} GestureEvent
 *   tap の time は指を置いた時刻、x・y は指を置いた位置。
 */

/**
 * @param {{ thresholdPx?: number, tapTimeoutMs?: number }} [opts]
 */
export function createFlickTracker(opts = {}) {
  const threshold = opts.thresholdPx ?? CONFIG.flick.thresholdPx;
  const tapTimeout = opts.tapTimeoutMs ?? CONFIG.flick.tapTimeoutMs;
  /** @type {Map<number, { x: number, y: number, t: number, state: 'pending'|'done' }>} */
  const pointers = new Map();

  function resolveTap(id, p) {
    p.state = 'done';
    return /** @type {GestureEvent} */ ({ type: 'tap', id, x: p.x, y: p.y, time: p.t });
  }

  return {
    /** 指を置いた。 */
    down(id, x, y, t) {
      pointers.set(id, { x, y, t, state: 'pending' });
    },

    /**
     * 指が動いた。24 ピクセルを超えた瞬間にフリックを返す（離すのを待たない）。
     * 300 ミリ秒を過ぎていたらフリックにはせず、タップを確定する。
     * @returns {GestureEvent|null}
     */
    move(id, x, y, t) {
      const p = pointers.get(id);
      if (!p || p.state !== 'pending') return null;
      if (t - p.t > tapTimeout) return resolveTap(id, p);
      const dx = x - p.x;
      const dy = y - p.y;
      if (Math.hypot(dx, dy) < threshold) return null;
      p.state = 'done';
      return { type: 'flick', id, dir: dirFromDelta(dx, dy), time: t };
    },

    /**
     * 指を離した。まだ何も確定していなければタップ。
     * @returns {GestureEvent|null}
     */
    up(id, x, y, t) {
      const p = pointers.get(id);
      pointers.delete(id);
      if (!p || p.state !== 'pending') return null;
      return resolveTap(id, p);
    },

    /** 指が取り消された（システムの割りこみなど）。何も返さない。 */
    cancel(id) {
      pointers.delete(id);
    },

    /**
     * 毎コマ呼ぶ。置いたまま 300 ミリ秒動かなかった指をタップとして確定する。
     * @returns {GestureEvent[]}
     */
    update(t) {
      const out = [];
      for (const [id, p] of pointers) {
        if (p.state === 'pending' && t - p.t > tapTimeout) out.push(resolveTap(id, p));
      }
      return out;
    },

    /** まだフリックかタップか決まっていない指のうち、最も早く置いた時刻。なければ null。 */
    earliestPending() {
      let min = null;
      for (const p of pointers.values()) if (p.state === 'pending' && (min === null || p.t < min)) min = p.t;
      return min;
    },
  };
}
