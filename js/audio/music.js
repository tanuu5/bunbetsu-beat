// 曲の合成。ハ長調、4 分の 4 拍子。段階が進むほど音の層が増える。
// conductor から拍ごとに呼ばれ、その拍の中の音（8 分・16 分音符）をまとめて予約する。

import { CONFIG } from '../config.js';
import { sectionAt } from '../core/chart.js';
import { createSynth, mtof } from './synth.js';

// 和音（MIDI の音の高さ）。各段階の頭から 4 小節でひとめぐりする。
const C = [60, 64, 67];
const Am = [57, 60, 64];
const F = [53, 57, 60];
const G = [55, 59, 62];
const LOOP = [C, Am, F, G];

// 主旋律（独自）。8 小節。[8 分音符のマス, 音の高さ, 長さ（8 分音符いくつぶん）]
const MELODY = [
  [[0, 76, 2], [2, 79, 1], [3, 76, 1], [4, 72, 2], [6, 74, 2]],
  [[0, 76, 3], [3, 72, 1], [4, 69, 2], [6, 72, 2]],
  [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 72, 2], [6, 69, 2]],
  [[0, 71, 2], [2, 74, 2], [4, 79, 4]],
  [[0, 79, 2], [2, 81, 1], [3, 79, 1], [4, 76, 2], [6, 72, 2]],
  [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 74, 2]],
  [[0, 72, 2], [2, 74, 1], [3, 76, 1], [4, 77, 2], [6, 81, 2]],
  [[0, 79, 3], [3, 77, 1], [4, 74, 2], [6, 71, 2]],
];

// 低音の動き（和音の根音からの半音の数）。1 拍ごと。
const BASS_STEPS = [0, 12, 0, 7];

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {import('../core/chart.js').Section[]} sections
 * @param {{ spb: number, isFever?: (songTime: number) => boolean }} opts
 */
export function createMusic(ctx, out, sections, opts) {
  const bpb = CONFIG.beatsPerBar;
  const spb = opts.spb;
  const e8 = spb / 2;
  const isFever = opts.isFever ?? (() => false);
  const syn = createSynth(ctx);

  // 楽器ごとの音量の通り道
  const bus = (gain, lowpass = 0) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      g.connect(f).connect(out);
    } else g.connect(out);
    return g;
  };
  const drums = bus(0.55);
  const bassBus = bus(0.55, 1100);
  const chordBus = bus(0.4, 3200);
  const leadBus = bus(0.45, 4200);
  const bellBus = bus(0.4);

  // ---- 楽器 ----
  const kick = (t) => {
    syn.tone({ freq: 160, freqEnd: 42, when: t, dur: 0.2, gain: 0.95, dest: drums });
    syn.tone({ type: 'triangle', freq: 900, freqEnd: 200, when: t, dur: 0.015, gain: 0.25, dest: drums });
  };
  const hat = (t, g = 0.12) => syn.hiss({ when: t, dur: 0.045, gain: g, from: 7500, q: 0.7, filterType: 'highpass', dest: drums });
  const snare = (t, g = 0.35) => {
    syn.hiss({ when: t, dur: 0.14, gain: g, from: 1900, q: 0.7, dest: drums });
    syn.tone({ type: 'triangle', freq: 200, freqEnd: 150, when: t, dur: 0.09, gain: g * 0.8, dest: drums });
  };
  const crash = (t) => syn.hiss({ when: t, dur: 1.4, gain: 0.16, from: 5000, q: 0.5, filterType: 'highpass', dest: drums });
  const bass = (t, m, len) => syn.tone({ type: 'square', freq: mtof(m), when: t, dur: len, gain: 0.2, sustain: 1, release: 0.04, dest: bassBus });
  const stab = (t, chord, shift, g = 0.07) => {
    for (const m of chord) syn.tone({ type: 'square', freq: mtof(m + shift), when: t, dur: 0.11, gain: g, dest: chordBus });
  };
  const lead = (t, m, len, g = 0.11) => {
    syn.tone({ type: 'square', freq: mtof(m), when: t, dur: len, gain: g, sustain: 1, release: 0.05, attack: 0.008, dest: leadBus });
    syn.tone({ type: 'triangle', freq: mtof(m), when: t, dur: len, gain: g * 0.8, sustain: 1, release: 0.05, attack: 0.008, detune: 7, dest: leadBus });
  };
  const bell = (t, m, g = 0.06) => {
    syn.tone({ freq: mtof(m), when: t, dur: 0.3, gain: g, dest: bellBus });
    syn.tone({ freq: mtof(m) * 2.76, when: t, dur: 0.12, gain: g * 0.25, dest: bellBus });
  };
  const click = (t, freq, gain) => syn.tone({ type: 'triangle', freq, when: t, dur: 0.07, gain, attack: 0.002, dest: drums });

  /** 拍の位置で鳴っている和音。 */
  function chordAt(beat) {
    const sec = sectionAt(sections, Math.max(0, beat));
    const bar = Math.floor((Math.max(0, beat) - sec.startBeat) / bpb);
    if (sec.id === 'count') return bar === 0 ? C : G;
    if (sec.id === 'switch') return G;
    if (sec.id === 'ending') return C;
    return LOOP[bar % LOOP.length];
  }

  /** 区間ごとの、音の層の数（0 = カウント）。切り替えの小節は、ひとつ前の段階のまま。 */
  function levelOf(sec) {
    if (sec.id === 'phase') return sec.phase;
    if (sec.id === 'switch') {
      const prev = sections[sections.indexOf(sec) - 1];
      return prev?.phase ?? 1;
    }
    return 0;
  }

  return {
    chordAt,

    /** 拍 1 つぶんの音を、context の時刻 when から予約する。過ぎてしまった音は鳴らさない。 */
    scheduleBeat(beat, when) {
      const sec = sectionAt(sections, beat);
      const rel = beat - sec.startBeat;
      const bar = Math.floor(rel / bpb);
      const inBar = rel % bpb;
      const chord = chordAt(beat);
      const now = ctx.currentTime - 0.005;
      const at = (t) => t >= now;

      if (sec.id === 'count') {
        // 1 小節目は準備、2 小節目で 4 回数える
        if (bar === 1 && at(when)) click(when, inBar === 0 ? 1760 : 1320, 0.5);
        return;
      }
      if (sec.id === 'ending') {
        // 終わりの和音
        if (rel === 0 && at(when)) {
          kick(when);
          crash(when);
          const len = spb * bpb * 1.6;
          for (const m of [60, 64, 67, 72]) lead(when, m, len, 0.07);
          bass(when, 36, len);
          bell(when + e8, 84, 0.08);
          bell(when + e8 * 2, 88, 0.08);
          bell(when + e8 * 3, 91, 0.08);
        }
        return;
      }

      const level = levelOf(sec);
      const fever = isFever(beat * spb);
      const isSwitch = sec.id === 'switch';

      // 第 1 段階から：大太鼓（4 分音符ごと）、刻みの金物、低音
      if (at(when)) kick(when);
      if (at(when + e8)) hat(when + e8, 0.13);
      if (level >= 4 || fever) {
        // 刻みが細かくなる
        if (at(when)) hat(when, 0.05);
        if (at(when + e8 / 2)) hat(when + e8 / 2, 0.05);
        if (at(when + e8 * 1.5)) hat(when + e8 * 1.5, 0.05);
      }
      const root = chord[0] - 24;
      const bm = root + BASS_STEPS[inBar];
      if (at(when)) bass(when, bm, e8 * 1.6);
      if (level >= 2 && at(when + e8)) bass(when + e8, bm, e8 * 0.7);

      // 第 2 段階から：小太鼓、和音
      if (level >= 2) {
        if ((inBar === 1 || inBar === 3) && at(when)) snare(when);
        if (at(when + e8)) stab(when + e8, chord, 0);
        if (fever && at(when + e8)) stab(when + e8, chord, 12, 0.045);
      }

      // 切り替えの小節：小太鼓の連打で次の段階へつなぐ
      if (isSwitch && inBar >= 2) {
        const g = inBar === 2 ? 0.2 : 0.3;
        if (at(when)) snare(when, g);
        if (at(when + e8)) snare(when + e8, g + 0.05);
        if (inBar === 3 && at(when + e8 * 1.5)) snare(when + e8 * 1.5, 0.35);
      }

      // 第 3 段階から：主旋律（切り替えの小節では休む）
      if (level >= 3 && !isSwitch) {
        const phrase = MELODY[bar % MELODY.length];
        for (const [slot, m, len] of phrase) {
          if (Math.floor(slot / 2) !== inBar) continue;
          const t = when + (slot % 2) * e8;
          if (!at(t)) continue;
          lead(t, m, len * e8 * 0.92);
          if (fever) lead(t, m + 12, len * e8 * 0.92, 0.05);
        }
      }

      // 第 4 段階：飾りの旋律（和音の分散）
      if (level >= 4 && !isSwitch) {
        const arp = [chord[0] + 24, chord[2] + 12, chord[1] + 24, chord[2] + 12];
        for (let k = 0; k < 2; k++) {
          const t = when + k * e8;
          if (at(t)) bell(t, arp[(inBar * 2 + k) % arp.length]);
        }
      }

      // フィーバー中：きらめく音
      if (fever) {
        for (let k = 0; k < 2; k++) {
          const t = when + k * e8 + e8 * 0.5;
          if (at(t)) bell(t, chord[(inBar + k) % 3] + 36, 0.035);
        }
      }
    },
  };
}
