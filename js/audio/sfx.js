// 効果音の合成。入力の瞬間にすぐ鳴らす。

import { createSynth, mtof } from './synth.js';

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 */
export function createSfx(ctx, out) {
  const syn = createSynth(ctx);
  const tone = (o) => syn.tone({ when: ctx.currentTime, dest: out, ...o });
  const hiss = (o) => syn.hiss({ when: ctx.currentTime, dest: out, q: 2, ...o });

  function sparkle(chord, when) {
    chord.forEach((m, i) => tone({ freq: mtof(m + 24), dur: 0.18, gain: 0.08, when: when + 0.03 + i * 0.035 }));
  }

  // 種類ごとに、和音の何番目の音を使うか
  const DEGREE = { burn: 0, plastic: 1, can: 2, pet: 0 };

  return {
    /**
     * ゴミが入った音。高さは今の和音から選ぶ。
     * @param {string} type @param {boolean} perfect @param {number[]} chord
     */
    hit(type, perfect, chord) {
      const when = ctx.currentTime;
      const f = mtof(chord[DEGREE[type]] + 12);
      if (type === 'burn') {
        // 木を叩く音
        tone({ freq: f * 1.5, freqEnd: f * 1.45, dur: 0.09, gain: 0.5, when });
        hiss({ from: 2500, q: 4, dur: 0.03, gain: 0.25, when });
      } else if (type === 'plastic') {
        // 軽い「ぽこ」
        tone({ freq: f * 2, freqEnd: f, dur: 0.12, gain: 0.45, when });
      } else if (type === 'can') {
        // 金属の「かん」
        [1, 2.76, 5.4, 8.93].forEach((r, i) => tone({ freq: f * 2 * r, dur: 0.45 / (1 + i * 0.8), gain: 0.22 / (1 + i), when }));
      } else if (type === 'pet') {
        // 空洞の「ぼん」
        tone({ freq: f / 2, freqEnd: f / 2.3, dur: 0.22, gain: 0.55, when });
        hiss({ from: f, q: 6, dur: 0.12, gain: 0.2, when });
      }
      if (perfect) sparkle(chord, when);
    },

    /** 低くやわらかい「ぶー」。 */
    miss() {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      tone({ type: 'triangle', freq: 160, freqEnd: 110, dur: 0.28, gain: 0.3, attack: 0.02, filter: lp });
    },

    /** 短い風切り音。 */
    whiff() {
      hiss({ from: 3000, to: 700, q: 1.5, dur: 0.09, gain: 0.12 });
    },

    /** 捨てないものを見送れたとき。ひよこは「ぴよ」、ねこは「にゃ」。 */
    safe(kind) {
      const when = ctx.currentTime;
      if (kind === 'cat') {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 3;
        bp.frequency.setValueAtTime(900, when);
        bp.frequency.exponentialRampToValueAtTime(1800, when + 0.08);
        bp.frequency.exponentialRampToValueAtTime(1000, when + 0.25);
        tone({ type: 'sawtooth', freq: 520, freqEnd: 440, dur: 0.26, gain: 0.3, attack: 0.03, filter: bp, when });
      } else {
        tone({ freq: 2300, freqEnd: 3000, dur: 0.07, gain: 0.2, when });
        tone({ freq: 2800, freqEnd: 2200, dur: 0.09, gain: 0.2, when: when + 0.09 });
      }
    },

    /** ゴミ箱の登場。上がっていく音階。 */
    binAppear() {
      const when = ctx.currentTime;
      [72, 74, 76, 79, 84].forEach((m, i) => tone({ type: 'square', freq: mtof(m), dur: 0.09, gain: 0.08, when: when + i * 0.06 }));
    },

    /** フィーバー開始。短いファンファーレ。 */
    fever() {
      const when = ctx.currentTime;
      [[67, 0], [72, 0.1], [76, 0.2], [79, 0.3]].forEach(([m, t]) => tone({ type: 'square', freq: mtof(m), dur: t === 0.3 ? 0.4 : 0.12, gain: 0.1, when: when + t }));
      sparkle([72, 76, 79], when + 0.3);
    },

    /** 評価の発表。評価ごとに違う短い旋律。 */
    rank(rank) {
      const when = ctx.currentTime;
      const tunes = {
        S: [[72, 0], [76, 0.1], [79, 0.2], [84, 0.3], [88, 0.45]],
        A: [[72, 0], [76, 0.12], [79, 0.24], [84, 0.4]],
        B: [[72, 0], [74, 0.14], [76, 0.28]],
        C: [[67, 0], [65, 0.16], [64, 0.32]],
      };
      const notes = tunes[rank] ?? tunes.C;
      notes.forEach(([m, t], i) => tone({ type: 'square', freq: mtof(m), dur: i === notes.length - 1 ? 0.5 : 0.14, gain: 0.09, when: when + t }));
      if (rank === 'S') sparkle([84, 88, 91], when + 0.45);
    },

    /** ボタンの「ぽん」。 */
    button() {
      tone({ freq: 700, freqEnd: 520, dur: 0.07, gain: 0.3 });
    },
  };
}
