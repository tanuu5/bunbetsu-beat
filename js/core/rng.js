// 種つきの乱数。譜面には Math.random() を使わず、これを使う。

/**
 * mulberry32。同じ種からは必ず同じ列が出る。
 * @param {number} seed 32 ビットの整数として扱う
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** 0 以上 1 未満 */
    next,
    /** 0 以上 n 未満の整数 */
    int: (n) => Math.floor(next() * n),
    /** 配列から 1 つ選ぶ */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /**
     * 重みつきでキーを 1 つ選ぶ。
     * @param {Record<string, number>} weights
     */
    weighted: (weights) => {
      const keys = Object.keys(weights).filter((k) => weights[k] > 0);
      const total = keys.reduce((s, k) => s + weights[k], 0);
      let r = next() * total;
      for (const k of keys) {
        r -= weights[k];
        if (r < 0) return k;
      }
      return keys[keys.length - 1];
    },
  };
}

/** 現在時刻などの数値から、種に使う 32 ビットの整数を作る。 */
export function seedFrom(value) {
  let h = 2166136261 >>> 0;
  const s = String(value);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 1000000; // URL に書きやすい大きさにしておく
}
